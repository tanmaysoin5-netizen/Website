// public/login.js (fixed redirect + removed /auth/check)
(async function () {
  const usernameEl = document.getElementById('username');
  const passwordEl = document.getElementById('password');
  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  const togglePw = document.getElementById('toggle-pw');
  const showSignup = document.getElementById('show-signup');
  const rememberEl = document.getElementById('remember');
  const errorEl = document.getElementById('error');
  const pwStrength = document.getElementById('pw-strength');

  let signupMode = false;

  function showError(msg) {
    errorEl.style.display = 'block';
    errorEl.textContent = msg;
  }
  function clearError() { errorEl.style.display = 'none'; errorEl.textContent = ''; }

  togglePw.addEventListener('click', () => {
    const t = passwordEl;
    if (t.type === 'password') { t.type = 'text'; togglePw.textContent = 'Hide'; }
    else { t.type = 'password'; togglePw.textContent = 'Show'; }
  });

  // simple password strength hint
  passwordEl.addEventListener('input', () => {
    const v = passwordEl.value || '';
    if (v.length === 0) pwStrength.textContent = 'Password required';
    else if (v.length < 6) pwStrength.textContent = 'Too short (min 6)';
    else if (/[A-Z]/.test(v) && /\d/.test(v) && v.length >= 8) pwStrength.textContent = 'Strong';
    else if (v.length >= 6) pwStrength.textContent = 'Medium';
  });

  showSignup.addEventListener('click', () => {
    signupMode = !signupMode;
    document.getElementById('authTitle').textContent = signupMode ? 'Create an account' : 'Sign in to NextWear';
    signupBtn.style.display = signupMode ? 'inline-block' : 'none';
    loginBtn.style.display = signupMode ? 'none' : 'inline-block';
    showSignup.textContent = signupMode ? 'Have an account? Sign in' : 'Create account';
    clearError();
  });

  async function doRequest(path, body) {
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) throw json;
      return json;
    } catch (e) { throw e; }
  }

  // LOGIN
  loginBtn.addEventListener('click', async () => {
    clearError();
    const username = usernameEl.value.trim();
    const password = passwordEl.value || '';
    if (!username || !password) return showError('Enter username and password');

    try {
      await doRequest('/auth/login', { username, password });
      window.location.href = '/index.html';     // FIXED
    } catch (e) {
      showError(e?.error || 'Login failed');
    }
  });

  // SIGNUP
  signupBtn.addEventListener('click', async () => {
    clearError();
    const username = usernameEl.value.trim();
    const password = passwordEl.value || '';
    if (!username || !password) return showError('Enter username and password');

    try {
      await doRequest('/auth/signup', { username, password });
      window.location.href = '/index.html';     // FIXED
    } catch (e) {
      showError(e?.error || 'Signup failed');
    }
  });

})();
