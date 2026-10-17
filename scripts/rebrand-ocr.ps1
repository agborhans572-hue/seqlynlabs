param([string]$InputList='reports/rebrand/products.json',[string]$Output='reports/rebrand/source-ocr.json')
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]
function Resolve-Operation($operation,$type){$task=$asTask.MakeGenericMethod($type).Invoke($null,@($operation));$task.Wait();return $task.Result}
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if(!$engine){throw 'No local OCR language is available.'}
$taskRoot=(Get-Location).Path
$results=@()
foreach($row in (Get-Content -LiteralPath $InputList -Raw | ConvertFrom-Json)){
 try{
  $path=Join-Path $taskRoot ('dist/client'+$row.source)
  $file=Resolve-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
  $stream=Resolve-Operation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder=Resolve-Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap=Resolve-Operation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result=Resolve-Operation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $results+=@{source=$row.source;text=$result.Text;lines=@($result.Lines | ForEach-Object {$_.Text})}
  $bitmap.Dispose();$stream.Dispose()
 }catch{$results+=@{source=$row.source;error=$_.Exception.Message}}
}
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Output -Encoding UTF8
Write-Output "OCR inspected $($results.Count) images."
