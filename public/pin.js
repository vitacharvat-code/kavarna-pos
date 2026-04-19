// Sdílený PIN modal
// Použití: askPin().then(() => { /* povoleno */ }).catch(() => { /* zrušeno */ })

const CORRECT_PIN  = '8910';
const SESSION_KEY  = 'kavarna_admin_auth';

export function isAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function authenticate() {
  sessionStorage.setItem(SESSION_KEY, '1');
}

export function askPin() {
  return new Promise((resolve, reject) => {
    // Pokud již autentizován v této session, přeskočit
    if (isAuthenticated()) { resolve(); return; }

    const overlay = document.createElement('div');
    overlay.className = 'pin-overlay';
    overlay.innerHTML = `
      <div class="pin-modal">
        <div class="pin-icon">🔒</div>
        <h3>Zadej PIN</h3>
        <div class="pin-dots" id="pinDots">
          <span></span><span></span><span></span><span></span>
        </div>
        <div class="pin-error" id="pinError"></div>
        <div class="pin-grid">
          ${[1,2,3,4,5,6,7,8,9,'','0','⌫'].map(k => `
            <button class="pin-key" data-key="${k}">${k}</button>
          `).join('')}
        </div>
        <button class="pin-cancel">Zrušit</button>
      </div>
    `;
    document.body.appendChild(overlay);

    let entered = '';

    function updateDots() {
      overlay.querySelectorAll('#pinDots span').forEach((s, i) => {
        s.classList.toggle('filled', i < entered.length);
      });
    }

    function showError(msg) {
      const el = overlay.querySelector('#pinError');
      el.textContent = msg;
      overlay.querySelector('.pin-modal').classList.add('shake');
      setTimeout(() => overlay.querySelector('.pin-modal').classList.remove('shake'), 400);
      entered = '';
      updateDots();
    }

    function close() {
      overlay.remove();
    }

    overlay.querySelectorAll('.pin-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (key === '⌫') {
          entered = entered.slice(0, -1);
        } else if (key === '') {
          return;
        } else if (entered.length < 4) {
          entered += key;
        }
        updateDots();

        if (entered.length === 4) {
          if (entered === CORRECT_PIN) {
            authenticate();
            close();
            resolve();
          } else {
            showError('Nesprávný PIN');
          }
        }
      });
    });

    overlay.querySelector('.pin-cancel').addEventListener('click', () => {
      close();
      reject();
    });
  });
}
