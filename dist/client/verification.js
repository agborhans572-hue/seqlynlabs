(() => {
  const form = document.querySelector('.rgate-form');
  if (!form) return;
  const overlay = document.querySelector('.rgate-overlay');
  const button = form.querySelector('.rgate-btn');
  const checks = [...form.querySelectorAll('input[type=checkbox]')];
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.style.cssText = 'color:#923954;font-size:16px;line-height:1.5;margin:12px 0 0';
  form.append(message);
  const label = button.textContent;
  let pending = false;
  button.disabled = false;
  button.type = 'button';
  const close = () => {
    document.documentElement.classList.add('rgate-ok');
    overlay.style.display = 'none';
    document.body.style.overflow = 'auto';
  };
  if (document.cookie.split(';').some(c => c.trim() === 'rgate_ack=1')) close();
  async function enter(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pending) return;
    const missing = checks.find(c => !c.checked);
    if (checks.length !== 2 || missing) {
      message.textContent = 'Please check both confirmations before entering.';
      missing?.focus();
      return;
    }
    pending = true;
    button.disabled = true;
    button.textContent = 'Entering…';
    message.textContent = '';
    try {
      const response = await fetch('/api/verification', {
        method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({age: true, researcher: true}),
        signal: AbortSignal.timeout(10000)
      });
      const result = await response.json();
      if (!response.ok || result.accepted !== true) throw Error(result.error || 'Verification could not be saved. Please try again.');
      document.cookie = 'rgate_ack=1; Path=/; Max-Age=2592000; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
      close();
    } catch (error) {
      message.textContent = error.name === 'TimeoutError' ? 'The connection timed out. Please click Enter again.' : error.message;
    } finally {
      pending = false;
      button.disabled = false;
      button.textContent = label;
    }
  }
  button.addEventListener('click', enter, true);
  form.addEventListener('submit', enter, true);
})();
