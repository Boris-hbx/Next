// ========== 设置页面逻辑 ==========

// 加载用户信息到设置页
async function loadSettingsData() {
    try {
        var data = await API.getMe();
        if (data.success && data.user) {
            document.getElementById('settings-username').textContent = data.user.username;
            document.getElementById('settings-display-name').textContent =
                data.user.display_name || data.user.username;
        }
    } catch(e) {
        // ignore
    }
    // 清空密码字段
    document.getElementById('settings-old-password').value = '';
    document.getElementById('settings-new-password').value = '';
    document.getElementById('settings-confirm-password').value = '';
    // 初始化头像选择器
    highlightSelectedPreset();
    applyAvatar();
}

// 修改密码
async function changePassword() {
    var oldPwd = document.getElementById('settings-old-password').value;
    var newPwd = document.getElementById('settings-new-password').value;
    var confirmPwd = document.getElementById('settings-confirm-password').value;

    if (!oldPwd) {
        showToast('请输入当前密码', 'error');
        return;
    }
    if (!newPwd || newPwd.length < 8) {
        showToast('新密码至少需要 8 个字符', 'error');
        return;
    }
    if (newPwd !== confirmPwd) {
        showToast('两次输入的新密码不一致', 'error');
        return;
    }

    try {
        var data = await API.changePassword(oldPwd, newPwd);
        if (data.success) {
            showToast('密码修改成功', 'success');
            document.getElementById('settings-old-password').value = '';
            document.getElementById('settings-new-password').value = '';
            document.getElementById('settings-confirm-password').value = '';
        } else {
            showToast(data.message || '密码修改失败', 'error');
        }
    } catch(e) {
        showToast('密码修改失败', 'error');
    }
}

// 退出登录
async function doLogout() {
    try { await API.logout(); } catch(e) {}
    window.location.href = '/login.html';
}

// ========== 头像系统 ==========

var AVATAR_PRESETS = {
    'preset:cat': 'assets/images/preset-cat.png',
    'preset:panda': 'assets/images/preset-panda.png'
};

var AVATAR_GRADIENTS = {
    'color:blue': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'color:green': 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'color:orange': 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
    'color:pink': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
};

// 选择预置头像
function selectPresetAvatar(el) {
    var value = el.dataset.avatar;
    localStorage.setItem('userAvatar', value);
    highlightSelectedPreset();
    applyAvatar();
}

// 上传自定义头像（canvas 压缩到 128x128）
function handleAvatarUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            var ctx = canvas.getContext('2d');
            // 居中裁切为正方形
            var size = Math.min(img.width, img.height);
            var sx = (img.width - size) / 2;
            var sy = (img.height - size) / 2;
            ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
            var dataURL = canvas.toDataURL('image/jpeg', 0.8);
            try {
                localStorage.setItem('userAvatar', dataURL);
            } catch(e) {
                showToast('图片太大，保存失败，请选择较小的图片', 'error');
                return;
            }
            highlightSelectedPreset();
            applyAvatar();
            showToast('头像已更新', 'success');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be selected again
    event.target.value = '';
}

// 应用头像到所有位置（header + settings preview）
function applyAvatar() {
    var value = localStorage.getItem('userAvatar');
    var initial = window._userInitial || 'B';

    // 收集所有需要更新的头像目标
    var targets = [
        {
            text: document.getElementById('avatar-text'),
            img: document.getElementById('avatar-img'),
            container: document.getElementById('header-avatar')
        },
        {
            text: document.getElementById('settings-avatar-text'),
            img: document.getElementById('settings-avatar-img'),
            container: document.getElementById('settings-avatar-preview')
        }
    ];

    targets.forEach(function(t) {
        if (!t.container) return;

        if (value && AVATAR_PRESETS[value]) {
            // 预置图片头像
            if (t.img) {
                t.img.src = AVATAR_PRESETS[value];
                t.img.style.display = 'block';
            }
            if (t.text) t.text.style.display = 'none';
        } else if (value && AVATAR_GRADIENTS[value]) {
            // 渐变色 + 首字母
            if (t.img) t.img.style.display = 'none';
            if (t.text) {
                t.text.style.display = '';
                t.text.textContent = initial;
            }
            t.container.style.background = AVATAR_GRADIENTS[value];
        } else if (value && value.startsWith('data:image/')) {
            // 用户上传的自定义头像
            if (t.img) {
                t.img.src = value;
                t.img.style.display = 'block';
            }
            if (t.text) t.text.style.display = 'none';
        } else {
            // 默认：蓝紫渐变 + 首字母
            if (t.img) t.img.style.display = 'none';
            if (t.text) {
                t.text.style.display = '';
                t.text.textContent = initial;
            }
            t.container.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
    });
}

// 高亮当前选中的预置头像
function highlightSelectedPreset() {
    var value = localStorage.getItem('userAvatar') || '';
    document.querySelectorAll('.avatar-preset').forEach(function(el) {
        el.classList.toggle('selected', el.dataset.avatar === value);
    });
}
