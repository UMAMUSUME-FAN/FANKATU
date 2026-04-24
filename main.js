const GAS_ENDPOINT = ''; 
const DB_KEY = 'uma_mock_db';
let currentUser = null;
let currentCircle = null; // 現在選択中のサークル情報
let activeDrawerMemberId = null;
let isAdminLogin = false;

document.addEventListener('DOMContentLoaded', () => {
    const authOverlay = document.getElementById('authOverlay');
    const appWrapper = document.getElementById('appWrapper');
    const authMessage = document.getElementById('auth-message');

    // Discord OAuth2 Settings
    const DISCORD_CLIENT_ID = '1497168159210340484';
    const DISCORD_REDIRECT_URI = 'https://umamusume-fan.github.io/FANKATU/';

    // --- 1. Process Discord Implicit Flow Token ---
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get('access_token');
    const tokenType = fragment.get('token_type');

    if (accessToken) {
        window.history.replaceState({}, document.title, window.location.pathname); // URLを綺麗にする
        authMessage.textContent = "Discordで認証中...";
        authMessage.style.color = "#5865F2";
        
        fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `${tokenType} ${accessToken}` }
        })
        .then(result => result.json())
        .then(async response => {
            if (response.id) {
                const displayName = response.global_name || response.username;
                const avatarIcon = response.avatar ? `https://cdn.discordapp.com/avatars/${response.id}/${response.avatar}.png` : '';
                
                // DB側への登録処理
                const res = await callBackend({ 
                    action: 'discord_login', 
                    memberId: response.id, 
                    name: displayName, 
                    icon: avatarIcon 
                });

                if (res.success) {
                    currentUser = { memberId: response.id, name: displayName, icon: avatarIcon };
                    localStorage.setItem('uma_current_user', JSON.stringify(currentUser));
                    loginSuccess();
                } else {
                    authMessage.textContent = "データベースへの登録に失敗しました";
                    authMessage.style.color = "red";
                }
            } else {
                authMessage.textContent = "Discord認証に失敗しました";
                authMessage.style.color = "red";
            }
        })
        .catch(err => {
            console.error(err);
            authMessage.textContent = "ネットワークエラーが発生しました";
            authMessage.style.color = "red";
        });
    } else {
        // 通常のロード処理
        const savedUser = localStorage.getItem('uma_current_user');
        if (savedUser) { currentUser = JSON.parse(savedUser); loginSuccess(); }
    }

    // --- 2. Click button to Auth ---
    document.getElementById('discordLoginBtn').onclick = () => {
        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=token&scope=identify`;
        window.location.href = authUrl;
    };

    document.getElementById('logoutBtn').onclick = () => { logout(); };
    document.getElementById('circleLogoutBtn').onclick = () => { logout(); };

    function logout() {
        localStorage.removeItem('uma_current_user'); 
        currentUser = null; currentCircle = null; isAdminLogin = false;
        appWrapper.style.display = 'none'; 
        document.getElementById('circleSelectionOverlay').classList.add('hidden');
        authOverlay.classList.remove('hidden');
    }

    async function loginSuccess() {
        authOverlay.classList.add('hidden');
        
        // 所属サークルチェック
        const res = await callBackend({ action: 'get_user_circles', memberId: currentUser.memberId });
        if (res.circles && res.circles.length > 0) {
            showCircleSelection(res.circles);
        } else {
            // どこにも所属していない場合はサークル作成/参加画面へ
            showCircleSelection([]);
        }
    }

    // サークル選択画面の表示
    function showCircleSelection(circles) {
        const overlay = document.getElementById('circleSelectionOverlay');
        const list = document.getElementById('circleList');
        overlay.classList.remove('hidden');
        list.innerHTML = '';

        if (circles.length === 0) {
            list.innerHTML = '<p style="font-size:12px; color:#bbb; text-align:center;">所属しているサークルがありません</p>';
        }

        circles.forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'glass-btn';
            btn.style.width = '100%';
            btn.style.textAlign = 'left';
            btn.style.marginBottom = '8px';
            btn.innerHTML = `<span class="material-icons-outlined" style="font-size:16px; vertical-align:middle; margin-right:8px;">group</span>${c.name}`;
            btn.onclick = () => selectCircle(c.id);
            list.appendChild(btn);
        });
    }

    // サークル検索
    document.getElementById('searchCircleBtn').onclick = async () => {
        const query = document.getElementById('searchCircleName').value;
        if (!query) return;
        const res = await callBackend({ action: 'search_circles', query: query });
        const resultsDiv = document.getElementById('searchResults');
        resultsDiv.innerHTML = '';
        if (res.results.length === 0) {
            resultsDiv.innerHTML = '<p style="font-size:12px; color:#bbb; text-align:center;">見つかりませんでした</p>';
        }
        res.results.forEach(c => {
            const row = document.createElement('div');
            row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center';
            row.style.background = 'rgba(0,0,0,0.03)'; row.style.padding = '8px 12px'; row.style.borderRadius = '10px';
            row.innerHTML = `<span style="font-size:13px; font-weight:600;">${c.name}</span> <button class="glass-btn primary" style="padding:4px 10px; font-size:11px;">所属する</button>`;
            row.querySelector('button').onclick = () => selectCircle(c.id);
            resultsDiv.appendChild(row);
        });
    };

    // サークル作成
    document.getElementById('createCircleBtn').onclick = async () => {
        const name = document.getElementById('newCircleName').value;
        if (!name) return alert('サークル名を入力してください');
        const res = await callBackend({ action: 'create_circle', name: name, ownerId: currentUser.memberId });
        if (res.success) {
            document.getElementById('newCircleName').value = '';
            selectCircle(res.circleId);
        }
    };

    // サークル切り替え
    document.getElementById('switchCircleBtn').onclick = () => {
        isAdminLogin = false;
        appWrapper.style.display = 'none';
        loginSuccess();
    };

    async function selectCircle(circleId) {
        const res = await callBackend({ action: 'select_circle', circleId: circleId, memberId: currentUser.memberId });
        if (res.pending) {
            alert('サークルリーダーに所属申請を送りました！承認されるまでお待ちください。');
            return;
        }
        if (res.success) {
            currentCircle = res.circle;
            document.getElementById('circleSelectionOverlay').classList.add('hidden');
            appWrapper.style.display = 'flex';
            
            const ua = document.getElementById('userAvatar');
            if (currentUser.icon) { ua.style.backgroundImage = `url('${currentUser.icon}')`; ua.textContent = ''; }
            else ua.textContent = currentUser.name.charAt(0);
            
            window.currentChartMode = 'personal';
            refreshDashboard();
        }
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
        const res = await callBackend({ action: 'get_db', circleId: currentCircle.id });
        
        // 管理者認証
        const currentAdminId = res.db.adminId || 'admin';
        const currentAdminPass = res.db.adminPass || 'admin';
        
        const enteredId = prompt('管理者IDを入力してください');
        if (enteredId !== currentAdminId) return alert('IDが違います！');
        
        const enteredPass = prompt('管理者パスワードを入力してください');
        if (enteredPass !== currentAdminPass) return alert('パスワードが違います！');

        isAdminLogin = true;
        refreshDashboard(); 

        // 申請リストの描画
        const reqList = document.getElementById('adminJoinRequests');
        reqList.innerHTML = '';
        const requests = res.db.joinRequests || [];
        if (requests.length === 0) reqList.innerHTML = '<p style="font-size:11px; color:#bbb; text-align:center;">現在、待機中の申請はありません</p>';
        requests.forEach(r => {
            const div = document.createElement('div');
            div.style.display = 'flex'; div.style.justifyContent = 'space-between'; div.style.alignItems = 'center'; div.style.marginBottom = '5px';
            div.innerHTML = `
                <span style="font-size:12px;">${r.name}</span>
                <div>
                    <button onclick="window.handleRequest('${r.memberId}', true)" style="background:#2ed573; color:white; border:none; padding:3px 8px; border-radius:5px; cursor:pointer; font-size:10px;">許可</button>
                    <button onclick="window.handleRequest('${r.memberId}', false)" style="background:#ff4757; color:white; border:none; padding:3px 8px; border-radius:5px; cursor:pointer; font-size:10px;">拒否</button>
                </div>
            `;
            reqList.appendChild(div);
        });

        document.getElementById('adminCircleNameInput').value = currentCircle.name;
        document.getElementById('adminIdInput').value = currentAdminId;
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

    // 管理者用: 申請の処理
    window.handleRequest = async (memberId, accept) => {
        await callBackend({ action: 'handle_join_request', circleId: currentCircle.id, applicantId: memberId, accept: accept });
        document.getElementById('adminBtn').click(); // リスト更新
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
            circleId: currentCircle.id,
            name: document.getElementById('adminCircleNameInput').value,
            totalTarget: parseInt(document.getElementById('adminTotalTarget').value),
            discordWebhook: document.getElementById('adminDiscordWebhook').value,
            adminId: document.getElementById('adminIdInput').value,
            adminPass: document.getElementById('adminPassInput').value,
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

            const res = await callBackend({ action: 'upload', memberId: currentUser.memberId, circleId: currentCircle.id, image: reader.result });
            if (res.success) {
                // Discord Webhook (もし設定されていれば)
                if (window.discordWebhookUrl) {
                    // ペース計算（15日〜20日の間なら警告メンションを飛ばす）
                    const today = new Date();
                    const d = today.getDate();
                    let warningText = "";
                    let isDanger = false;
                    
                    if (d >= 15 && d <= 20) {
                        const dbRef = await callBackend({ action: 'get_db', circleId: currentCircle.id });
                        const myTarget = dbRef.db.individualTargets[currentUser.memberId] || 3000000;
                        const myCurrent = dbRef.db.fans[currentUser.memberId] || 0;
                        
                        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
                        const dailyAvg = myCurrent / d;
                        const projected = dailyAvg * daysInMonth;
                        
                        if (projected < myTarget) {
                            warningText = `\n⚠️ <@${currentUser.memberId}> 今のペースだと月末予測が **${Math.floor(projected).toLocaleString()}人** となり、目標に届かない危険性があります！頑張って！`;
                            isDanger = true;
                        }
                    }

                    const message = {
                        // メンションを確実に通知させるためのプロパティ
                        content: isDanger ? `<@${currentUser.memberId}>` : "",
                        embeds: [{
                            title: "🎉 サークル活動進捗！",
                            color: isDanger ? 16711680 : 16490938, // 危険なら赤、通常はピンク
                            description: `**${currentUser.name}** がファン数データを更新しました！${warningText}`,
                            fields: [
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

    async function refreshRanking() {
        const res = await callBackend({ action: 'get_ranking' });
        const list = document.getElementById('circleRankingList');
        if (!list) return;
        list.innerHTML = '';
        
        res.ranking.forEach((c, idx) => {
            const isMyCircle = currentCircle && c.id === currentCircle.id;
            const row = document.createElement('div');
            row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.padding = '10px 12px';
            row.style.background = isMyCircle ? 'rgba(251, 161, 186, 0.15)' : 'rgba(255,255,255,0.5)';
            row.style.borderRadius = '12px';
            row.style.border = isMyCircle ? '1px solid var(--primary)' : '1px solid #eee';
            row.style.cursor = 'pointer';
            row.style.transition = '0.2s';
            row.onmouseover = () => row.style.transform = 'translateX(5px)';
            row.onmouseout = () => row.style.transform = 'translateX(0)';
            
            row.onclick = () => {
                if (isMyCircle) return;
                if (confirm(`${c.name} に参加申請を送りますか？（または所属済みなら切り替えます）`)) {
                    selectCircle(c.id);
                }
            };

            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-weight:bold; color:var(--text-dark); width:20px; text-align:center;">${idx + 1}</span>
                    <span style="font-size:14px; font-weight:600;">${c.name}</span>
                </div>
                <span style="font-size:13px; font-weight:bold; color:var(--primary);">${(c.totalFans/10000).toFixed(1)}万</span>
            `;
            list.appendChild(row);
        });
    }

    // --- Dashboard Refresh ---
    async function refreshDashboard() {
        if (!currentCircle) return;
        const res = await callBackend({ action: 'get_db', circleId: currentCircle.id });
        const db = res.db;
        currentCircle.name = db.name; // 最新の名前に更新
        window.discordWebhookUrl = db.discordWebhook || '';

        // UIにサークル名を反映
        document.querySelectorAll('.circle-name-display').forEach(el => el.textContent = db.name);
        
        refreshRanking();

        // --- mixi風の自分のマイページデータ表示 ---
        const myFans = db.fans[currentUser.memberId] || 0;
        const myTarget = db.individualTargets[currentUser.memberId] || 3000000;
        const pct = Math.min(100, Math.floor((myFans / myTarget) * 100));
        const rem = Math.max(0, myTarget - myFans);

        document.getElementById('totalFanProgress').style.width = pct + '%';
        document.getElementById('totalFanPercentText').textContent = pct + '%';
        document.getElementById('displayTotalTarget').textContent = myTarget.toLocaleString();
        document.getElementById('displayRemaining').textContent = rem.toLocaleString();

        // チャートの表示切替機能
        const toggleBtn = document.getElementById('toggleChartBtn');
        const cTitle = document.getElementById('mainChartTitle');
        const cDesc = document.getElementById('mainChartDesc');

        if (!window.currentChartMode) window.currentChartMode = 'personal';
        
        toggleBtn.onclick = () => {
            window.currentChartMode = window.currentChartMode === 'personal' ? 'circle' : 'personal';
            refreshDashboard();
        };

        if (window.currentChartMode === 'personal') {
            cTitle.textContent = "My Fan Growth";
            cDesc.textContent = "あなたのファン数推移";
            toggleBtn.textContent = "サークル全体を表示";
            drawMyChart(myFans);
        } else {
            cTitle.textContent = "Circle Growth";
            if (isAdminLogin) {
                cDesc.textContent = "サークル全員の推移（管理者ビュー）";
                toggleBtn.textContent = "個人の推移を表示";
                drawAdminOverlayChart(db);
            } else {
                cDesc.textContent = "サークル全体の累積ファン数";
                toggleBtn.textContent = "個人の推移を表示";
                drawCircleTotalChart(db);
            }
        }

        const mgrid = document.getElementById('membersGrid');
        mgrid.innerHTML = '';
        const frozen = db.frozen || {};

        // 管理者モードの場合、ファン数が多い順にソート（管理者のみの特典）
        let sortedMembers = [...db.members];
        if (isAdminLogin) {
            sortedMembers.sort((a, b) => (db.fans[b.memberId] || 0) - (db.fans[a.memberId] || 0));
        }

        sortedMembers.forEach(m => {
            if (frozen[m.memberId]) return; // 凍結されたメンバーはダッシュボードに表示しない
            
            const mdiv = document.createElement('div');
            mdiv.className = 'member-avatar-mini';
            if (m.icon) mdiv.style.backgroundImage = `url('${m.icon}')`;
            else mdiv.innerHTML = m.name.charAt(0);

            // ✨ 管理者のみ、目標達成度・獲得量に応じた「赤い縁（オーラ）」の演出が見える
            if (isAdminLogin) {
                const myCurrent = db.fans[m.memberId] || 0;
                const myTarget = db.individualTargets[m.memberId] || 3000000;
                const progressRatio = Math.min(1, Math.max(0, myCurrent / myTarget)); // 0.0〜1.0

                if (progressRatio > 0.01) { 
                    const alpha = (progressRatio * 0.85 + 0.15).toFixed(2);
                    const borderSize = progressRatio > 0.5 ? 3 : 2;
                    mdiv.style.border = `${borderSize}px solid rgba(220, 20, 60, ${alpha})`;
                    mdiv.style.boxShadow = `0 0 ${progressRatio * 25}px rgba(220, 20, 60, ${alpha})`;
                }
            }
            
            mdiv.onclick = () => {
                // 自分自身か、管理者ログイン状態の時のみ詳細画面を開ける
                if (!isAdminLogin && m.memberId !== currentUser.memberId) {
                    alert('プライバシー保護のため、他のメンバーの詳細データは管理者のみ閲覧可能です。（※自分のデータは見ることができます）');
                    return;
                }

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

    // --- Chart: Circle Total ---
    function drawCircleTotalChart(db) {
        const ctx = document.getElementById('growthChart');
        if (!ctx) return;
        if (myChart) myChart.destroy();
        
        let totalF = 0;
        db.members.forEach(m => {
            if (!(db.frozen && db.frozen[m.memberId])) {
                totalF += (db.fans[m.memberId] || 0);
            }
        });
        
        let baseFans = totalF * 0.4;
        let step = (totalF - baseFans) / 5;
        const dataPoints = [Math.floor(baseFans), Math.floor(baseFans + step), Math.floor(baseFans + step*2), Math.floor(baseFans + step*3), Math.floor(baseFans + step*4), totalF];
        
        myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: ['1週目', '2週目', '3週目', '4週目', '昨日', '今日'], datasets: [{ label: 'サークル合計ファン数', data: dataPoints, borderColor: '#a1c4fb', backgroundColor: 'rgba(161, 196, 251, 0.2)', fill: true, tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: true }, y: { display: true, ticks: { callback: v => v >= 10000 ? (v/10000)+'万' : v } } } }
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
                // 完全マルチ対応DB構造: { circles: { id: { ... } }, userToCircles: { userId: [ids] } }
                let db = JSON.parse(localStorage.getItem(DB_KEY) || '{"circles":{}, "userToCircles":{}}');
                
                if (data.action === 'discord_login') {
                    // ユーザー情報の保存（ここではサークル所属とは別）
                    res({ success: true });
                }
                else if (data.action === 'get_user_circles') {
                    const circleIds = db.userToCircles[data.memberId] || [];
                    const myCircles = circleIds.map(id => ({ id: id, name: db.circles[id] ? db.circles[id].name : 'Unknown' }));
                    res({ success: true, circles: myCircles.filter(c => c.name !== 'Unknown') });
                }
                else if (data.action === 'search_circles') {
                    const query = data.query.toLowerCase();
                    const results = Object.keys(db.circles)
                        .filter(id => db.circles[id].name.toLowerCase().includes(query))
                        .map(id => ({ id: id, name: db.circles[id].name }));
                    res({ success: true, results: results });
                }
                else if (data.action === 'create_circle') {
                    const cid = 'C' + Date.now();
                    db.circles[cid] = {
                        name: data.name,
                        members: [{ memberId: data.ownerId, name: currentUser.name, icon: currentUser.icon }],
                        fans: {},
                        individualTargets: {},
                        totalTarget: 100000000,
                        lastResetMonth: new Date().getMonth() + 1,
                        adminId: 'admin',
                        adminPass: 'admin',
                        discordWebhook: ''
                    };
                    if (!db.userToCircles[data.ownerId]) db.userToCircles[data.ownerId] = [];
                    db.userToCircles[data.ownerId].push(cid);
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                    res({ success: true, circleId: cid });
                }
                else if (data.action === 'select_circle') {
                    const c = db.circles[data.circleId];
                    if (!c) return res({ success: false });

                    const isMember = c.members.find(m => m.memberId === data.memberId);
                    if (isMember) {
                        res({ success: true, circle: { id: data.circleId, name: c.name } });
                    } else {
                        // 所属していない場合は「申請」を出す
                        c.joinRequests = c.joinRequests || [];
                        if (!c.joinRequests.find(r => r.memberId === data.memberId)) {
                            c.joinRequests.push({ memberId: data.memberId, name: currentUser.name });
                        }
                        localStorage.setItem(DB_KEY, JSON.stringify(db));
                        res({ success: true, pending: true });
                    }
                }
                else if (data.action === 'handle_join_request') {
                    const c = db.circles[data.circleId];
                    c.joinRequests = (c.joinRequests || []).filter(r => r.memberId !== data.applicantId);
                    if (data.accept) {
                        if (!c.members.find(m => m.memberId === data.applicantId)) {
                            c.members.push({ memberId: data.applicantId, name: currentUser.name, icon: '' }); // 実際はキャッシュのアイコン等を引く
                            if (!db.userToCircles[data.applicantId]) db.userToCircles[data.applicantId] = [];
                            db.userToCircles[data.applicantId].push(data.circleId);
                        }
                    }
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                    res({ success: true });
                }
                else if (data.action === 'get_db') {
                    const c = db.circles[data.circleId];
                    // 月末リセット判定
                    const currentMonth = new Date().getMonth() + 1;
                    if (c.lastResetMonth !== currentMonth) {
                        c.fans = {};
                        c.lastResetMonth = currentMonth;
                        localStorage.setItem(DB_KEY, JSON.stringify(db));
                    }
                    res({ success: true, db: c });
                }
                else if (data.action === 'get_ranking') {
                    const ranking = Object.keys(db.circles).map(id => {
                        const c = db.circles[id];
                        const totalFans = Object.values(c.fans).reduce((a, b) => a + b, 0);
                        return { id: id, name: c.name, totalFans: totalFans };
                    });
                    ranking.sort((a, b) => b.totalFans - a.totalFans);
                    res({ success: true, ranking: ranking.slice(0, 10) }); // 上位10サークル
                }
                else if (data.action === 'upload') {
                    const c = db.circles[data.circleId];
                    c.fans[data.memberId] = (c.fans[data.memberId] || 0) + 150000;
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                    res({ success: true, detectedFans: 150000 });
                }
                else if (data.action === 'toggle_freeze') {
                    const c = db.circles[data.circleId];
                    c.frozen = c.frozen || {};
                    c.frozen[data.memberId] = !c.frozen[data.memberId];
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                    res({ success: true });
                }
                else if (data.action === 'save_admin') {
                    const c = db.circles[data.circleId];
                    if (data.name) c.name = data.name;
                    c.totalTarget = data.totalTarget;
                    c.discordWebhook = data.discordWebhook;
                    c.adminId = data.adminId || c.adminId;
                    if (data.adminPass) c.adminPass = data.adminPass;
                    c.individualTargets = { ...c.individualTargets, ...data.individualTargets };
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                    res({ success: true });
                }
            }, 100);
        });
    }
});
