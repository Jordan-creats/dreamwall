(function() {
  if (localStorage.getItem('wp_token')) {
    window.location.href = '/';
    return;
  }

  const $ = (s) => document.getElementById(s);
  const state = {
    tab: 'login',
    phoneMode: 'password',
    forgotStep: 1,
    resetToken: null,
    smsCountdown: 0,
    smsTimer: null,
    pendingPhone: null,
  };

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.auth-section').forEach(s => s.classList.remove('active'));
    const sec = $('section-' + tab);
    if (sec) sec.classList.add('active');
    $('authError').textContent = '';
    $('authSuccess').textContent = '';

    if (tab === 'register' && state.pendingPhone) {
      $('regPhone').value = state.pendingPhone;
      state.pendingPhone = null;
    }
  }

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  function showError(msg) { $('authError').textContent = msg; $('authSuccess').textContent = ''; }
  function showSuccess(msg) { $('authSuccess').textContent = msg; $('authError').textContent = ''; }

  function handleAuthResponse(data, res) {
    if (!res.ok) { showError(data.error || '操作失败'); return; }
    if (data.token) {
      localStorage.setItem('wp_token', data.token);
      localStorage.setItem('wp_user', JSON.stringify(data.user));
      sessionStorage.removeItem('wp_view_only');
      showSuccess('成功！正在跳转...');
      setTimeout(() => { window.location.href = '/'; }, 800);
    }
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const login = $('loginField').value.trim();
    const password = $('loginPassword').value;
    if (!login || !password) { showError('请填写所有字段'); return; }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password })
      });
      handleAuthResponse(await res.json(), res);
    } catch { showError('网络错误，请重试'); }
  });

  $('toForgotLink').addEventListener('click', () => switchTab('forgot'));

  $('phoneModeSwitch').addEventListener('click', () => {
    state.phoneMode = state.phoneMode === 'password' ? 'sms' : 'password';
    updatePhoneModeUI();
    showError('');
  });

  function updatePhoneModeUI() {
    var isSms = state.phoneMode === 'sms';
    $('phonePwdMode').style.display = isSms ? 'none' : '';
    $('phoneSmsMode').style.display = isSms ? '' : 'none';
    $('phoneModeSwitch').textContent = isSms ? '切换到密码登录' : '切换验证码登录';
    $('phoneSubmitBtn').textContent = isSms ? '验证码登录' : '登 录';
    $('phoneRegisterHint').style.display = 'none';
  }

  function startCountdown(btn) {
    if (state.smsTimer) clearInterval(state.smsTimer);
    state.smsCountdown = 60;
    btn.disabled = true;
    btn.textContent = '重新发送 (60s)';
    state.smsTimer = setInterval(function() {
      state.smsCountdown--;
      if (state.smsCountdown <= 0) {
        clearInterval(state.smsTimer);
        state.smsTimer = null;
        btn.disabled = false;
        btn.textContent = '发送验证码';
      } else {
        btn.textContent = '重新发送 (' + state.smsCountdown + 's)';
      }
    }, 1000);
  }

  async function sendSMS(phone, btn) {
    if (!/^1[3-9]\d{9}$/.test(phone)) { showError('请输入有效的手机号'); return null; }
    if (state.smsTimer) { showError('请等待倒计时结束'); return null; }
    try {
      var res = await fetch('/api/auth/send-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone })
      });
      var data = await res.json();
      if (!res.ok) { showError(data.error); return null; }
      startCountdown(btn);
      if (data.dev_code) {
        showError('');
        showSuccess('开发模式：验证码为 ' + data.dev_code);
        return data.dev_code;
      }
      showSuccess('验证码已发送');
      return null;
    } catch { showError('网络错误'); return null; }
  }

  $('smsSendBtn').addEventListener('click', function() {
    var phone = $('phoneFieldSms').value.trim();
    sendSMS(phone, $('smsSendBtn')).then(function(code) {
      if (code) $('phoneCodeField').value = code;
    });
  });

  $('phoneForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    showError(''); showSuccess('');
    var isSms = state.phoneMode === 'sms';
    var phone = isSms ? $('phoneFieldSms').value.trim() : $('phoneFieldPwd').value.trim();
    if (!phone) { showError('请输入手机号'); return; }

    try {
      var res, data;
      if (isSms) {
        var code = $('phoneCodeField').value.trim();
        if (!code) { showError('请输入验证码'); return; }
        res = await fetch('/api/auth/login-phone', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone, code: code })
        });
        data = await res.json();
        if (data.need_register) {
          state.pendingPhone = data.phone;
          $('phoneRegisterHint').style.display = '';
          return;
        }
      } else {
        var password = $('phonePwdField').value;
        if (!password) { showError('请输入密码'); return; }
        res = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: phone, password: password })
        });
        data = await res.json();
      }
      handleAuthResponse(data, res);
    } catch { showError('网络错误，请重试'); }
  });

  $('toRegisterFromPhone').addEventListener('click', function() {
    if (state.pendingPhone) $('regPhone').value = state.pendingPhone;
    switchTab('register');
  });

  $('regPhone').addEventListener('input', function() {
    var phone = $('regPhone').value.trim();
    $('regSmsBtn').disabled = !phone || phone.length < 11;
  });

  $('regSmsBtn').addEventListener('click', function() {
    var phone = $('regPhone').value.trim();
    sendSMS(phone, $('regSmsBtn')).then(function(code) {
      if (code) {
        $('regSmsCodeWrap').style.display = '';
        $('regSmsCode').value = code;
      } else {
        $('regSmsCodeWrap').style.display = '';
      }
    });
  });

  $('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    showError('');
    var username = $('regUsername').value.trim();
    var email = $('regEmail').value.trim();
    var password = $('regPassword').value;
    var phone = $('regPhone').value.trim();

    if (!username || !email || !password) { showError('请填写必填字段'); return; }
    if (phone.length > 0 && phone.length < 11) { showError('手机号格式不正确'); return; }

    try {
      var res, data;
      if (phone) {
        var smsCode = $('regSmsCode').value.trim();
        if (!smsCode) { showError('请输入短信验证码'); return; }
        res = await fetch('/api/auth/register-phone', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username, email: email, password: password, phone: phone, code: smsCode })
        });
        data = await res.json();
      } else {
        res = await fetch('/api/auth/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username, email: email, password: password })
        });
        data = await res.json();
      }
      handleAuthResponse(data, res);
    } catch { showError('网络错误，请重试'); }
  });

  // ── Forgot Password ──────────────────
  function updateForgotUI() {
    document.querySelectorAll('.forgot-step').forEach(function(s) {
      var step = parseInt(s.dataset.step);
      s.classList.remove('active', 'done');
      if (step < state.forgotStep) s.classList.add('done');
      else if (step === state.forgotStep) s.classList.add('active');
    });
    document.querySelectorAll('.forgot-divider').forEach(function(d) {
      var step = parseInt(d.dataset.step);
      d.classList.toggle('done', state.forgotStep > step);
    });
    $('forgotStep1').style.display = state.forgotStep === 1 ? '' : 'none';
    $('forgotStep2').style.display = state.forgotStep === 2 ? '' : 'none';
    $('forgotStep3').style.display = state.forgotStep === 3 ? '' : 'none';
  }

  $('forgotEmailBtn').addEventListener('click', async function() {
    var email = $('forgotEmail').value.trim();
    if (!email) { showError('请输入邮箱'); return; }
    try {
      var res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      });
      var data = await res.json();
      if (res.ok) {
        if (data.dev_token) { state.resetToken = data.dev_token; }
        if (data.dev_code) {
          $('forgotCode').value = data.dev_code;
          showSuccess('开发模式：验证码已自动填入');
        } else {
          showSuccess(data.message || '重置码已发送');
        }
        state.forgotStep = 2;
        updateForgotUI();
      } else {
        showError(data.error);
      }
    } catch { showError('网络错误'); }
  });

  $('forgotResetBtn').addEventListener('click', async function() {
    var code = $('forgotCode').value.trim();
    var newPwd = $('forgotNewPassword').value;
    if (!code || code.length !== 6) { showError('请输入6位验证码'); return; }
    if (!newPwd || newPwd.length < 6) { showError('新密码至少6位'); return; }
    try {
      var res = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: state.resetToken || '', code: code, new_password: newPwd })
      });
      var data = await res.json();
      if (res.ok) {
        state.forgotStep = 3;
        updateForgotUI();
        showSuccess(data.message || '密码已重置');
      } else {
        showError(data.error);
      }
    } catch { showError('网络错误'); }
  });

  $('forgotBackLink').addEventListener('click', function() { switchTab('login'); });

  // ── WeChat OAuth ──────────────────────
  var wechatBtn = document.querySelector('.btn-wechat');
  if (wechatBtn) {
    fetch('/api/auth/wechat/auth-url').then(function(r) { return r.json(); }).then(function(d) {
      if (d.enabled) {
        wechatBtn.disabled = false;
        wechatBtn.addEventListener('click', function() { window.location.href = d.url; });
      }
    }).catch(function() {});
  }

  // Check for error in URL params
  var params = new URLSearchParams(window.location.search);
  var err = params.get('error');
  if (err) {
    if (err === 'wechat_cancelled') showError('微信授权已取消');
    else if (err === 'wechat_failed') showError('微信登录失败，请重试');
    else if (err === 'wechat_disabled') showError('微信登录未配置');
  }

  updateForgotUI();
})();
