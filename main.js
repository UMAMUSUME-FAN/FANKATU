const GAS_ENDPOINT = ''; 
const DB_KEY = 'uma_mock_db';
let currentUser = null;
let activeDrawerMemberId = null;

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

        window.isAdminLogin = true;
        refreshDashboard(); // 管理者ビュー（全員重ね合わせグラフなど）に切り替え

        document.getElementById('adminTotalTarget').value = res.db.totalTarget || 100000000;
        document.getElementById('adminDiscordWebhook').value = res.db.discordWebhook || '';
        document.getElementById('adminPassInput').value = '';
        const listDiv = document.getElementById('adminMemberList');
        listDiv.innerHTML = '';
        res.db.members.forEach(m => {
            const currTarget = res.db.individualTargets[m.memberId] || 3000000;
            const isFrozen = res.db.frozen && res.db.frozen[m.memberId];
            listDiv.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:5px 0; ${isFrozen ? 'opacity:0.5;' : ''}">
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                        <input type="checkbox" class="admin-member-check" value="${m.memberId}">
                        <span style="${isFrozen ? 'text-decoration:line-through;' : ''}">${m.name}</span>
                    </label>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:12px; color:var(--primary);" class="ind-target-display" data-id="${m.memberId}">${currTarget.toLocaleString()}</span>
                        <button onclick="window.toggleFreeze('${m.memberId}')" style="font-size:10px; padding:2px 5px; border-radius:5px; border:1px solid ${isFrozen ? '#4CAF50' : '#fba1ba'}; background:transparent; color:${isFrozen ? '#4CAF50' : '#fba1ba'}; cursor:pointer;">
                            ${isFrozen ? '復帰' : '凍結'}
                        </button>
                    </div>
                </div>
            `;
        });
        adminModal.classList.remove('hidden');
    };

    // グローバル関数: アカウント凍結切り替え
    window.toggleFreeze = async (memberId) => {
        await callBackend({ action: 'toggle_freeze', memberId: memberId });
        document.getElementById('adminBtn').click(); // リスト再描画
        refreshDashboard();
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
            // 解析中のプレビュー表示
            document.getElementById('uploadInner').innerHTML = `
                <div style="margin-bottom:10px;">
                    <img src="${reader.result}" style="max-height:80px; border-radius:10px; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
                </div>
                <p style="font-size:16px; font-weight:bold; color:var(--primary); animation: pulse 1.5s infinite;">解析中...</p>
            `;

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
        
        // --- mixi風の自分のマイページデータ表示 ---
        const myFans = db.fans[currentUser.memberId] || 0;
        const myTarget = db.individualTargets[currentUser.memberId] || 3000000;
        const pct = Math.min(100, Math.floor((myFans / myTarget) * 100));
        const rem = Math.max(0, myTarget - myFans);

        document.getElementById('totalFanProgress').style.width = pct + '%';
        document.getElementById('totalFanPercentText').textContent = pct + '%';
        document.getElementById('displayTotalTarget').textContent = myTarget.toLocaleString();
        document.getElementById('displayRemaining').textContent = rem.toLocaleString();

        // 自分が管理者の場合は全員の重ね合わせグラフ、そうでない場合は自分のグラフを表示
        if (window.isAdminLogin) {
            document.querySelector('#statsCard p').textContent = "サークル全員の推移（管理者ビュー）";
            drawAdminOverlayChart(db);
        } else {
            document.querySelector('#statsCard p').textContent = "あなたのファン数推移";
            drawMyChart(myFans);
        }

        const mgrid = document.getElementById('membersGrid');
        mgrid.innerHTML = '';
        const frozen = db.frozen || {};
        db.members.forEach(m => {
            if (frozen[m.memberId]) return; // 凍結されたメンバーはダッシュボードに表示しない
            
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
    }

    // --- Chart: Individual Dashboard ---
    let myChart = null;
    function drawMyChart(currentFans) {
        const ctx = document.getElementById('growthChart');
        if (!ctx) return;
        if (myChart) myChart.destroy();
        
        let baseFans = currentFans * 0.4;
        let step = (currentFans - baseFans) / 5;
        const dataPoints = [Math.floor(baseFans), Math.floor(baseFans + step), Math.floor(baseFans + step*2), Math.floor(baseFans + step*3), Math.floor(baseFans + step*4), currentFans];
        
        myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: ['1週目', '2週目', '3週目', '4週目', '昨日', '今日'], datasets: [{ label: 'ファン数', data: dataPoints, borderColor: '#fba1ba', backgroundColor: 'rgba(251, 161, 186, 0.2)', fill: true, tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: true }, y: { display: true, ticks: { callback: v => v >= 10000 ? (v/10000)+'万' : v } } } }
        });
    }

    // --- Chart: Admin Full Overlay ---
    function drawAdminOverlayChart(db) {
        const ctx = document.getElementById('growthChart');
        if (!ctx) return;
        if (myChart) myChart.destroy();
        
        const colors = ['#fba1ba', '#a1c4fb', '#fbe0a1', '#a1fba4', '#d8a1fb', '#fba1d2'];
        const datasets = db.members.map((m, idx) => {
            let cf = db.fans[m.memberId] || 0;
            let bf = cf * 0.3;
            let st = (cf - bf) / 5;
            return {
                label: m.name,
                data: [Math.floor(bf), Math.floor(bf+st), Math.floor(bf+st*2), Math.floor(bf+st*3), Math.floor(bf+st*4), cf],
                borderColor: colors[idx % colors.length],
                fill: false,
                tension: 0.4
            };
        });

        // 目標ラインも追加
        let totalTar = Object.values(db.individualTargets).reduce((a,b)=>a+b, 0) / (Object.keys(db.individualTargets).length || 1);
        datasets.push({
            label: '各自の平均目標',
            data: [totalTar, totalTar, totalTar, totalTar, totalTar, totalTar],
            borderColor: 'rgba(0,0,0,0.3)', borderDash: [5, 5], fill: false, pointRadius: 0
        });
        
        myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: ['1週目', '2週目', '3週目', '4週目', '昨日', '今日'], datasets: datasets },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'right', labels: { boxWidth:10, font: {size:10} } } }, scales: { x: { display: true }, y: { display: true, ticks: { callback: v => v >= 10000 ? (v/10000)+'万' : v } } } }
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
                else if (data.action === 'toggle_freeze') {
                    db.frozen = db.frozen || {};
                    db.frozen[data.memberId] = !db.frozen[data.memberId];
                    localStorage.setItem(DB_KEY, JSON.stringify(db)); res({success:true});
                }
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
