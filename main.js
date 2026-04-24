const GAS_ENDPOINT = ''; 
const DB_KEY = 'uma_mock_db';
let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    const authOverlay = document.getElementById('authOverlay');
    const appWrapper = document.getElementById('appWrapper');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const authMessage = document.getElementById('auth-message');
    
    document.getElementById('tab-login').onclick = (e) => {
        e.target.classList.add('active');
        document.getElementById('tab-register').classList.remove('active');
        document.getElementById('tab-register').style.color = '#bbb';
        document.getElementById('tab-register').style.borderBottomColor = '#eee';
        e.target.style.color = 'var(--text-dark)';
        e.target.style.borderBottomColor = '#fba1ba';
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
    };
    document.getElementById('tab-register').onclick = (e) => {
        e.target.classList.add('active');
        document.getElementById('tab-login').classList.remove('active');
        document.getElementById('tab-login').style.color = '#bbb';
        document.getElementById('tab-login').style.borderBottomColor = '#eee';
        e.target.style.color = 'var(--text-dark)';
        e.target.style.borderBottomColor = '#fba1ba';
        formRegister.classList.remove('hidden');
        formLogin.classList.add('hidden');
    };

    const savedUser = localStorage.getItem('uma_current_user');
    if (savedUser) { currentUser = JSON.parse(savedUser); loginSuccess(); }

    formLogin.onsubmit = async (e) => {
        e.preventDefault();
        const res = await callBackend({ action: 'login', name: document.getElementById('login-name').value, password: document.getElementById('login-pass').value });
        if (res.success) { currentUser = res; localStorage.setItem('uma_current_user', JSON.stringify(res)); loginSuccess(); }
        else authMessage.textContent = res.error;
    };

    formRegister.onsubmit = async (e) => {
        e.preventDefault();
        const res = await callBackend({ action: 'register', name: document.getElementById('reg-name').value, password: document.getElementById('reg-pass').value });
        if (res.success) { currentUser = { memberId: res.memberId, name: res.name, icon: '' }; localStorage.setItem('uma_current_user', JSON.stringify(currentUser)); loginSuccess(); }
        else authMessage.textContent = res.error;
    };

    document.getElementById('logoutBtn').onclick = () => {
        localStorage.removeItem('uma_current_user'); currentUser = null;
        appWrapper.style.display = 'none'; authOverlay.classList.remove('hidden');
    };

    function loginSuccess() {
        authOverlay.classList.add('hidden');
        appWrapper.style.display = 'flex';
        const ua = document.getElementById('userAvatar');
        if (currentUser.icon) { ua.style.backgroundImage = `url('${currentUser.icon}')`; ua.textContent = ''; }
        else ua.textContent = currentUser.name.charAt(0);
        refreshDashboard();
    }

    const avUpload = document.getElementById('myAvatarUpload');
    document.getElementById('userAvatar').onclick = () => avUpload.click();
    avUpload.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const rd = new FileReader();
            rd.onload = async (r) => {
                await callBackend({ action: 'update_profile', memberId: currentUser.memberId, icon: r.target.result });
                currentUser.icon = r.target.result;
                localStorage.setItem('uma_current_user', JSON.stringify(currentUser));
                loginSuccess();
            };
            rd.readAsDataURL(file);
        }
    };

    // --- Admin Modal Setup & Navigation ---
    const adminModal = document.getElementById('admin-modal');
    window.discordWebhookUrl = '';

    // ① トップナビゲーション・サイドナビの「スムーズスクロール」機能
    document.querySelectorAll('.nav-link, .nav-symbol').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const tid = el.currentTarget.getAttribute('data-target');
            if (tid && document.getElementById(tid)) {
                // スムーズスクロール
                document.getElementById(tid).scrollIntoView({ behavior: 'smooth', block: 'center' });
                // アクティブ状態を示すクラスの切り替え
                document.querySelectorAll('.nav-link, .nav-symbol').forEach(x => x.classList.remove('active'));
                document.querySelectorAll(`[data-target="${tid}"]`).forEach(x => x.classList.add('active'));
            }
        });
    });

    // ② 管理者ボタンにパスワード認証を搭載
    document.getElementById('adminBtn').onclick = async () => {
        const res = await callBackend({ action: 'get_db' });
        
        // 管理者パスワード入力画面 (初期パスワードは admin)
        const currentAdminPass = res.db.adminPass || 'admin';
        const entered = prompt('管理者パスワードを入力してください (初期設定: admin)');
        if (entered !== currentAdminPass) {
            alert('パスワードが違います！');
            return;
        }

        document.getElementById('adminTotalTarget').value = res.db.totalTarget || 100000000;
        document.getElementById('adminDiscordWebhook').value = res.db.discordWebhook || '';
        document.getElementById('adminPassInput').value = '';
        const listDiv = document.getElementById('adminMemberList');
        listDiv.innerHTML = '';
        res.db.members.forEach(m => {
            const currTarget = res.db.individualTargets[m.memberId] || 3000000;
            listDiv.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:5px 0;">
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                        <input type="checkbox" class="admin-member-check" value="${m.memberId}">
                        <span>${m.name}</span>
                    </label>
                    <span style="font-size:12px; color:var(--primary);" class="ind-target-display" data-id="${m.memberId}">${currTarget.toLocaleString()}</span>
                </div>
            `;
        });
        adminModal.classList.remove('hidden');
    };
    document.getElementById('closeAdmin').onclick = () => adminModal.classList.add('hidden');

    // Admin: Apply to checked
    document.getElementById('applyIndividualTargetBtn').onclick = () => {
        const val = document.getElementById('adminIndividualTarget').value;
        document.querySelectorAll('.admin-member-check:checked').forEach(chk => {
            const disp = document.querySelector(`.ind-target-display[data-id="${chk.value}"]`);
            if (disp) { disp.textContent = parseInt(val).toLocaleString(); disp.dataset.raw = val; }
        });
    };

    // Admin: Save DB
    document.getElementById('saveAdminBtn').onclick = async () => {
        const payload = {
            action: 'save_admin',
            totalTarget: parseInt(document.getElementById('adminTotalTarget').value),
            discordWebhook: document.getElementById('adminDiscordWebhook').value,
            individualTargets: {}
        };
        document.querySelectorAll('.ind-target-display').forEach(disp => {
            payload.individualTargets[disp.dataset.id] = parseInt(disp.dataset.raw || disp.textContent.replace(/,/g, ''));
        });
        await callBackend(payload);
        window.discordWebhookUrl = payload.discordWebhook;
        adminModal.classList.add('hidden');
        refreshDashboard();
    };

    // --- Paste & Upload ---
    document.getElementById('dropzone').onclick = () => {
        const finput = document.createElement('input'); finput.type = 'file'; finput.accept = 'image/*';
        finput.onchange = e => { if (e.target.files[0]) handleUpload(e.target.files[0]); };
        finput.click();
    };
    document.addEventListener('paste', e => {
        const item = Array.from(e.clipboardData.items).find(i => i.type.indexOf('image') !== -1);
        if (item) handleUpload(item.getAsFile());
    });

    async function handleUpload(file) {
        document.getElementById('uploadInner').innerHTML = `<p style="font-size:20px; font-weight:bold; color:var(--primary);">解析中...</p>`;
        const reader = new FileReader();
        reader.onload = async () => {
            const res = await callBackend({ action: 'upload', memberId: currentUser.memberId, image: reader.result });
            if (res.success) {
                // Discord Webhook (もし設定されていれば)
                if (window.discordWebhookUrl) {
                    const message = {
                        embeds: [{
                            title: "🎉 サークル活動進捗！",
                            color: 16490938, // ピンク
                            fields: [
                                { name: "メンバー名", value: currentUser.name, inline: true },
                                { name: "今回の獲得ファン数", value: `+${res.detectedFans.toLocaleString()}人`, inline: true }
                            ]
                        }]
                    };
                    fetch(window.discordWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) }).catch(e=>{});
                }

                // X(Twitter) のシェア用URL生成
                const tweetText = encodeURIComponent(`ウマ娘のサークル活動でファン数を【+${res.detectedFans.toLocaleString()}人】獲得しました！🎉 \n#ウマ娘 #サークルファン数`);
                const shareUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;

                // 画面を送信完了に切り替え、Xボタンを出す
                document.getElementById('uploadInner').innerHTML = `
                    <span class="material-icons-outlined" style="font-size:40px; color:#2ed573;">check_circle</span>
                    <p style="color:#2ed573; font-weight:bold;">+${res.detectedFans.toLocaleString()}</p>
                    <div style="margin-top:15px;">
                        <div onclick="window.open('${shareUrl}', '_blank');" style="background:#000; color:#fff; border:none; padding:8px 15px; border-radius:20px; font-weight:bold; cursor:pointer; font-size:12px; display:inline-block;">𝕏 で結果をポストする</div>
                    </div>
                `;
                
                // 3秒後に元の画面へ戻す
                setTimeout(() => { document.getElementById('uploadInner').innerHTML = `<span class="material-icons-outlined" style="font-size:40px;">cloud_upload</span><p style="margin-top:10px; font-weight:bold;">Waiting for Paste...</p>`; }, 4000);
                refreshDashboard();
            }
        };
        reader.readAsDataURL(file);
    }

    // --- Dashboard Refresh ---
    async function refreshDashboard() {
        const res = await callBackend({ action: 'get_db' });
        const db = res.db;
        window.discordWebhookUrl = db.discordWebhook || '';
        
        let totalCurrent = 0;
        db.members.forEach(m => totalCurrent += (db.fans[m.memberId] || 0));
        
        const totalTarget = db.totalTarget || 100000000;
        const pct = Math.min(100, Math.floor((totalCurrent / totalTarget) * 100));
        const rem = Math.max(0, totalTarget - totalCurrent);

        document.getElementById('totalFanProgress').style.width = pct + '%';
        document.getElementById('totalFanPercentText').textContent = pct + '%';
        document.getElementById('displayTotalTarget').textContent = totalTarget.toLocaleString();
        document.getElementById('displayRemaining').textContent = rem.toLocaleString();

        const mgrid = document.getElementById('membersGrid');
        mgrid.innerHTML = '';
        db.members.forEach(m => {
            const mdiv = document.createElement('div');
            mdiv.className = 'member-avatar-mini';
            if (m.icon) mdiv.style.backgroundImage = `url('${m.icon}')`;
            else mdiv.innerHTML = m.name.charAt(0);
            
            mdiv.onclick = () => {
                document.getElementById('detail-name').textContent = m.name;
                document.getElementById('detail-avatar').innerHTML = m.icon ? '' : m.name.charAt(0);
                document.getElementById('detail-avatar').style.backgroundImage = m.icon ? `url('${m.icon}')` : 'none';
                
                const currF = db.fans[m.memberId] || 0;
                const tarF = db.individualTargets[m.memberId] || 3000000;
                document.getElementById('detail-fan').textContent = `${currF.toLocaleString()} / ${tarF.toLocaleString()}`;
                document.getElementById('detail-progress').style.width = Math.min(100, (currF/tarF)*100) + '%';
                
                activeDrawerMemberId = m.memberId;
                document.getElementById('member-drawer-overlay').classList.remove('hidden');
                
                // 個人ごとのファン数増加グラフを描画
                drawMemberChart(m.memberId, currF);
            };
            
            const wrap = document.createElement('div');
            wrap.style.display = 'flex'; wrap.style.flexDirection = 'column'; wrap.style.alignItems = 'center';
            wrap.appendChild(mdiv);
            wrap.innerHTML += `<span class="member-name-mini">${m.name}</span>`;
            mgrid.appendChild(wrap);
        });

        drawChart();
    }

    // --- Chart: Circle Total ---
    let myChart = null;
    function drawChart() {
        const ctx = document.getElementById('growthChart');
        if (!ctx) return;
        if (myChart) myChart.destroy();
        myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Now'], datasets: [{ data: [20, 32, 48, 60, 72, 85], borderColor: '#fba1ba', backgroundColor: 'rgba(251, 161, 186, 0.2)', fill: true, tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: true }, y: { display: false } } }
        });
    }

    // --- Chart: Individual Member ---
    let memberChartInstance = null;
    function drawMemberChart(memberId, currentFans) {
        const ctx = document.getElementById('memberDailyChart');
        if (!ctx) return;
        if (memberChartInstance) memberChartInstance.destroy();
        
        // （本来はDBの履歴を使う場面ですが、今回は現在のファン数を基準に、過去1ヶ月分をシミュレーション推移して描画します）
        let baseFans = currentFans * 0.4;
        let step = (currentFans - baseFans) / 5;
        const dataPoints = [
            Math.floor(baseFans), 
            Math.floor(baseFans + step), 
            Math.floor(baseFans + step*2), 
            Math.floor(baseFans + step*3), 
            Math.floor(baseFans + step*4), 
            currentFans
        ];
        
        memberChartInstance = new Chart(ctx, {
            type: 'line',
            data: { 
                labels: ['1週目', '2週目', '3週目', '4週目', '昨日', '今日'], 
                datasets: [{ 
                    label: 'ファン数',
                    data: dataPoints, 
                    borderColor: '#fba1ba', 
                    backgroundColor: 'rgba(251, 161, 186, 0.2)', 
                    fill: true, 
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff'
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    x: { display: true }, 
                    y: { 
                        display: true,
                        ticks: {
                            callback: function(value) {
                                return value >= 10000 ? (value/10000) + '万' : value;
                            }
                        }
                     } 
                } 
            }
        });
    }

    // --- Drawer Close ---
    document.getElementById('close-drawer-btn').onclick = () => document.getElementById('member-drawer-overlay').classList.add('hidden');

    // --- Backend Mock ---
    async function callBackend(data) {
        if (GAS_ENDPOINT) { const r = await fetch(GAS_ENDPOINT, { method: 'POST', body: JSON.stringify(data) }); return await r.json(); }
        return new Promise(res => {
            setTimeout(() => {
                let db = JSON.parse(localStorage.getItem(DB_KEY) || '{"members":[], "fans":{}, "individualTargets":{}, "totalTarget":100000000}');
                if (data.action === 'register') {
                    if (db.members.find(m => m.name === data.name)) return res({success:false, error:'既に使われています'});
                    const id = 'M' + Date.now();
                    db.members.push({ memberId: id, name: data.name, pass: data.password, icon: '' });
                    localStorage.setItem(DB_KEY, JSON.stringify(db)); res({ success: true, memberId: id, name: data.name });
                }
                else if (data.action === 'login') {
                    const m = db.members.find(m => m.name === data.name && m.pass === data.password);
                    if (m) res({ success: true, memberId: m.memberId, name: m.name, icon: m.icon });
                    else res({ success: false, error: '違います' });
                }
                else if (data.action === 'update_profile') {
                    db.members.find(m => m.memberId === data.memberId).icon = data.icon;
                    localStorage.setItem(DB_KEY, JSON.stringify(db)); res({success:true});
                }
                else if (data.action === 'upload') {
                    db.fans[data.memberId] = (db.fans[data.memberId] || 0) + 150000;
                    localStorage.setItem(DB_KEY, JSON.stringify(db)); res({success:true, detectedFans: 150000});
                }
                else if (data.action === 'get_db') { res({success:true, db: db}); }
                else if (data.action === 'save_admin') {
                    db.totalTarget = data.totalTarget;
                    db.discordWebhook = data.discordWebhook;
                    db.individualTargets = { ...db.individualTargets, ...data.individualTargets };
                    localStorage.setItem(DB_KEY, JSON.stringify(db)); res({success:true});
                }
            }, 100);
        });
    }
});
