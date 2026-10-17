param([switch]$Edited)
Add-Type -AssemblyName System.Drawing
$taskRoot = (Get-Location).Path
$products = Get-Content 'reports/rebrand/products.json' -Raw | ConvertFrom-Json
if($Edited){$originalProducts=$products;$editRows=Get-Content 'reports/rebrand/edits.json' -Raw | ConvertFrom-Json;$products=@(foreach($edit in $editRows){[pscustomobject]@{source=$edit.target;name="$($edit.index) $($originalProducts[$edit.index].name)"}})}
$extras = Get-Content 'reports/rebrand/extra-images.json' -Raw | ConvertFrom-Json
foreach ($kind in $(if($Edited){@('edited')}else{@('products','extras')})) {
  $rows = if ($kind -ne 'extras') {$products} else {$extras | Where-Object { $_.source -notmatch '\.svg$' }}
  for ($start=0; $start -lt $rows.Count; $start+=12) {
    $canvas = New-Object System.Drawing.Bitmap(1200,1600)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.Clear([System.Drawing.Color]::FromArgb(235,235,235))
    $font = New-Object System.Drawing.Font('Arial',11)
    for($j=0; $j -lt 12 -and ($start+$j) -lt $rows.Count; $j++) {
      $row=$rows[$start+$j]
      $sourceFile=Join-Path $taskRoot ('dist/client'+$row.source)
      try{$img=[System.Drawing.Image]::FromFile($sourceFile)}catch{continue}
      $scale=[Math]::Min(290.0/$img.Width,350.0/$img.Height)
      $x=($j%4)*300; $y=[Math]::Floor($j/4)*533
      $g.DrawImage($img,[int]($x+(300-$img.Width*$scale)/2),[int]($y+20),[int]($img.Width*$scale),[int]($img.Height*$scale))
      $g.DrawString("$($start+$j) $($row.name)$($row.alt)",$font,[System.Drawing.Brushes]::Black,[single]($x+5),[single]($y+380))
      $g.DrawString(($row.source -replace '/assets/',''),$font,[System.Drawing.Brushes]::Black,[single]($x+5),[single]($y+430))
      $img.Dispose()
    }
    $canvas.Save((Join-Path $taskRoot "reports/rebrand/$kind-$start.jpg"),[System.Drawing.Imaging.ImageFormat]::Jpeg)
    $g.Dispose();$canvas.Dispose();$font.Dispose()
  }
}
