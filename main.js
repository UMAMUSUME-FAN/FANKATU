const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzyyeoQXI8HD9bVfAY5Eg3XMql5A9Ae2SS14YNrrhKECKYXcW-zJ8COsW8_FjKzjUk/exec'; 
let DISCORD_CLIENT_ID = '1497168159210340484';

let currentUser = null;
let currentCircle = null;

// --- Helper Functions ---
function showToast(m, t='success'){ const s=document.getElementById('toast'); if(!s) return; s.textContent=m; s.className=`toast show ${t}`; setTimeout(()=>s.classList.remove('show'),3000); }

document.addEventListener('DOMContentLoaded', async () => {
    const loginBtn = document.getElementById('discordLoginBtn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            const r = window.location.origin + window.location.pathname;
            window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(r)}&response_type=token&scope=identify`;
        };
    }

    const authOverlay = document.getElementById('authOverlay');
    const portalOverlay = document.getElementById('circleSelectionOverlay');
    const appWrapper = document.getElementById('appWrapper');
    
    await callBackend({ action: 'init' });
    
    // 起動時に招待パラメータをチェック
    const urlParams = new URLSearchParams(window.location.search);
    const joinCid = urlParams.get('join');

    async function handleAutoJoin() {
        if (joinCid && currentUser) {
            showToast("招待URLからサークルに参加中...");
            // URLからパラメータを消す
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // 参加処理
            await callBackend({ action: 'joinCircle', circleId: joinCid });
            loginToCircle(joinCid);
        }
    }
    
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
            const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
            const du = await userRes.json();
            currentUser = { id: du.id, name: du.username, avatar: `https://cdn.discordapp.com/avatars/${du.id}/${du.avatar}.png` };
            if(authOverlay) authOverlay.classList.add('hidden');
            
            // 招待URL経由なら自動加入へ、そうでなければポータル表示
            if (joinCid) {
                await handleAutoJoin();
            } else {
                showPortal();
            }
        } catch(e) { 
            console.error("Auth Fail", e); 
            showPortal(); // 失敗してもポータルへ
        }
    }

    async function showPortal() {
        if(!portalOverlay) return;
        portalOverlay.classList.remove('hidden');
        const pName = document.getElementById('portalUserName'); if(pName) pName.textContent = currentUser.name;
        const ava = document.getElementById('portalUserAvatar'); if(currentUser.avatar && ava) ava.style.backgroundImage = `url('${currentUser.avatar}')`;
        
        // 新規作成ボタンのイベント
        const createBtn = document.getElementById('createNewCircleBtn');
        if(createBtn) createBtn.onclick = async () => {
            const name = prompt("作成するサークルの名前を入力してください:");
            if (name) {
                const res = await callBackend({ action: 'createCircle', name: name });
                showToast(`サークル『${name}』を設立しました！`);
                renderPortalCircles(); // 一覧を更新
                loginToCircle(res.circleId); // 自動で入室
            }
        };

        renderPortalCircles();
    }

    async function renderPortalCircles() {
        const db = await callBackend({ action: 'getAllCircles' });
        const myList = document.getElementById('myCirclesList'); if(!myList) return;
        const resultsList = document.getElementById('searchResultsList'); if(!resultsList) return;
        myList.innerHTML = ''; resultsList.innerHTML = '';
        const userToCircles = db.userToCircles[currentUser.id] || [];
        userToCircles.forEach(cid => {
            const c = db.circles[cid]; if(!c) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style.marginBottom = '10px';
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right; background:var(--primary); color:white;">入室する</span>`;
            div.onclick = () => loginToCircle(cid); myList.appendChild(div);
        });
        Object.keys(db.circles).forEach(cid => {
            if (userToCircles.includes(cid)) return;
            const c = db.circles[cid];
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style.marginBottom = '10px';
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right;">参加申請</span>`;
            div.onclick = () => showToast("現在、新規の参加申請は締め切っています"); resultsList.appendChild(div);
        });
    }

    async function loginToCircle(cid) {
        const res = await callBackend({ action: 'getCircleData', circleId: cid });
        if (res.success) {
            currentCircle = res.circle;

            // --- 正会員としてメンバー登録を保証 ---
            const uid = currentUser?.id || 'guest';
            if (!currentCircle.members || !currentCircle.members[uid]) {
                const def = currentCircle.defaultTarget || 3000000;
                if(!currentCircle.members) currentCircle.members = {};
                currentCircle.members[uid] = { 
                    name: (currentUser?.name || 'Trainer'), 
                    totalFans: 0, 
                    targetFans: def, 
                    history: [], 
                    icon: (currentUser?.avatar || '') 
                };
                // データベースへ保存 (初期化)
                await callBackend({ action: 'updateFans', circleId: cid, fans: 0 });
            }

            if(portalOverlay) portalOverlay.classList.add('hidden');
            if(appWrapper) appWrapper.style.display = 'flex';
            const nameDisp = document.getElementById('userNameDisplay'); if(nameDisp) nameDisp.textContent = currentUser.name;
            const ua = document.getElementById('userAvatar'); if(currentUser.avatar && ua) ua.style.backgroundImage = `url('${currentUser.avatar}')`;
            
            // 最新データを読み直して全体反映
            await updateDataAndUI();
        }
    }

    async function updateDataAndUI() {
        // DBから最新情報を取得してローカル変数を確実に更新
        const db = await callBackend({ action: 'getAllCircles' });
        const cid = currentCircle ? currentCircle.id : 'circle-1';
        const res = await callBackend({ action: 'getCircleData', circleId: cid });
        if(res.success) { 
            currentCircle = res.circle; 
            // ユーザー情報が未登録なら初期化
            const uid = currentUser?.id || 'guest';
            if(!currentCircle.members[uid]) {
                currentCircle.members[uid] = { name: (currentUser?.name || 'Trainer'), totalFans: 0, targetFans: 3000000, history: [], icon: (currentUser?.avatar || '') };
            }
            updateDashboard(); 
        }
    }

    function updateDashboard() {
        if(!currentCircle) return;
        const c = currentCircle;
        const uid = currentUser?.id || 'guest';
        
        // 個別の設定がなければ、サークル全体の標準目標（defaultTarget）を使う
        const def = c.defaultTarget || 3000000;
        const my = c.members[uid] || { totalFans: 0, targetFans: def, history: [] };
        
        const cName = document.getElementById('circleNameDisplay'); if(cName) cName.textContent = c.name;
        const dt = document.getElementById('displayTotalTarget'); if(dt) dt.textContent = (my.targetFans || def).toLocaleString();
        const dr = document.getElementById('displayRemaining'); if(dr) dr.textContent = Math.max(0, (my.targetFans || def) - (my.totalFans || 0)).toLocaleString();
        const tp = document.getElementById('totalFanProgress'); if(tp) tp.style.width = Math.min(100, ((my.totalFans || 0) / (my.targetFans || def)) * 100) + '%';
        const tpt = document.getElementById('totalFanPercentText'); if(tpt) tpt.textContent = Math.floor(((my.totalFans || 0) / (my.targetFans || def)) * 100) + '%';
        
        renderGrowthChart(); renderMembers(); renderTimeline(); renderAIWisdom();
    }

    // --- Core Functions ---
    function renderGrowthChart() {
        const ctx = document.getElementById('growthChart'); if(!ctx || !currentCircle) return;
        const uid = currentUser?.id || 'guest';
        const my = currentCircle.members[uid] || { totalFans: 0, history: [] };
        
        // 履歴の整理 (0からスタートして現在のファン数へ)
        let rawHistory = (my.history && my.history.length > 0) ? my.history : [0];
        let historyData = rawHistory.length === 1 ? [0, rawHistory[0]] : rawHistory;
        
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'line',
            data: { 
                labels: historyData.map((_,i)=> i === 0 ? "Start" : `Update ${i}`), 
                datasets: [{ 
                    label: 'ファン数推移', 
                    data: historyData, 
                    borderColor: '#fba1ba', 
                    backgroundColor: 'rgba(251,161,186,0.1)', 
                    fill: true, 
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff',
                    borderWidth: 3
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        grid: { color: 'rgba(0,0,0,0.03)' },
                        ticks: { callback: function(value) { return (value / 10000).toLocaleString() + '万'; } }
                    }, 
                    x: { grid: { display: false } } 
                } 
            }
        });
    }

    function renderMembers() {
        const g = document.getElementById('membersGrid'); if(!g) return;
        g.innerHTML = '';
        Object.keys(currentCircle.members || {}).forEach(uid => {
            const m = currentCircle.members[uid];
            const d = document.createElement('div'); d.className = 'member-avatar-mini';
            if(m.icon) d.style.backgroundImage = `url('${m.icon}')`; else d.textContent = (m.name || 'U').substring(0,1);
            g.appendChild(d);
        });
    }

    let currentTagFilter = null;
    function renderTimeline() {
        const list = document.getElementById('timelineList'); if(!list) return;
        list.innerHTML = '';
        const c = currentCircle || { timeline: [] };
        let posts = c.timeline || [];
        if (currentTagFilter) {
            posts = posts.filter(p => (p.text || "").includes(currentTagFilter));
            const clearBtn = document.createElement('div');
            clearBtn.innerHTML = `<button class="glass-btn primary" style="width:100%; font-size:12px; margin-bottom:10px;">絞り込み解除: ${currentTagFilter}</button>`;
            clearBtn.onclick = () => { currentTagFilter = null; renderTimeline(); };
            list.appendChild(clearBtn);
        }
        if(posts.length === 0) { list.innerHTML = '<div style="text-align:center; padding:30px; opacity:0.4; font-size:12px;">パドックにはまだ投稿がありません。</div>'; return; }
        
        posts.slice().reverse().forEach(p => {
            const div = document.createElement('div'); div.className = 'timeline-item';
            div.style = "animation: slideIn 0.3s ease-out; margin-bottom:15px;";
            const text = p.text || "";
            const linkedText = text.replace(/#(\S+)/g, '<span class="hashtag">#$1</span>');
            let imagesHtml = (p.images || []).map(img => `<img src="${img}" style="width:calc(50% - 5px); border-radius:12px; border:1px solid #eee; object-fit:cover; aspect-ratio:16/9; cursor:pointer;" onclick="window.open(this.src)">`).join('');
            let imageGrid = imagesHtml ? `<div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:10px;">${imagesHtml}</div>` : '';
            div.innerHTML = `<div class="timeline-header"><span class="timeline-user">${p.userName || 'Trainer'}</span><span class="timeline-time">${p.time || ''}</span></div><div class="timeline-content">${linkedText}</div>${imageGrid}`;
            if(p.aiComment) div.innerHTML += `<div style="margin-top:10px; padding:12px; background:rgba(251,161,186,0.06); border-radius:12px; font-size:11px; border-left:4px solid var(--primary); line-height:1.5;"><b>✨ AI解析・文字起こし:</b><br>${p.aiComment.replace(/\n/g, '<br>')}</div>`;
            div.querySelectorAll('.hashtag').forEach(t => t.onclick = (e) => { e.stopPropagation(); currentTagFilter = t.textContent; renderTimeline(); });
            list.appendChild(div);
        });
    }

    async function renderAIWisdom() {
        const area = document.getElementById('aiWisdomContent'); if(!area) return;
        const db = await callBackend({ action: 'getAllCircles' });
        const wisdom = db.globalWisdom || [];
        let allTags = [];
        Object.values(db.circles).forEach(c => { (c.timeline || []).forEach(p => { const tags = (p.text || "").match(/#(\S+)/g); if(tags) allTags.push(...tags); }); });
        const tagCounts = allTags.reduce((acc, t) => (acc[t] = (acc[t] || 0) + 1, acc), {});
        const sortedTags = Object.entries(tagCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);
        let tagsHtml = `<div style="margin-bottom:20px; display:flex; flex-wrap:wrap; gap:8px;">`;
        sortedTags.forEach(([tag]) => { tagsHtml += `<span class="hashtag" style="font-size:11px; background:rgba(26,115,232,0.08); padding:4px 10px; border-radius:12px; cursor:pointer;">${tag}</span>`; });
        tagsHtml += `</div>`;
        area.innerHTML = tagsHtml + (wisdom.length === 0 ? "攻略情報を待機中..." : wisdom.slice(-8).reverse().map(w => `<div class="wisdom-tip"><span class="wisdom-tag">${w.category}</span>${w.text}</div>`).join(''));
        area.querySelectorAll('.hashtag').forEach(t => t.onclick = () => { currentTagFilter = t.textContent; renderTimeline(); });
    }

    // --- Image Processing ---
    async function compressImage(base64, maxWidth = 1000) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onerror = () => resolve(base64);
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    let width = img.width; let height = img.height;
                    if (width > maxWidth) { height = (maxWidth / width) * height; width = maxWidth; }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7)); 
                } catch(e) { resolve(base64); }
            };
            img.src = base64;
        });
    }

    async function callGemini(key, prompt, imageBase64s = []) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
            const parts = [{ text: prompt }];
            imageBase64s.forEach(img => parts.push({ inline_data: { mime_type: "image/jpeg", data: img.split(',')[1] } }));
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }] }) });
            const data = await res.json(); return data.candidates[0].content.parts[0].text;
        } catch (e) { return null; }
    }

    // --- Post Logic ---
    let currentImages = [];
    const postModal = document.getElementById('post-modal');
    const timelineInput = document.getElementById('timelineInput');
    const previewArea = document.getElementById('timelineImagePreview');

    const updatePreview = () => {
        if(!previewArea) return;
        previewArea.innerHTML = '';
        if (currentImages.length === 0) { previewArea.style.display = 'none'; return; }
        previewArea.style.display = 'flex';
        currentImages.forEach((img, idx) => {
            const div = document.createElement('div'); div.style = "position:relative; width:80px; height:80px; border-radius:10px; overflow:hidden; border:1px solid #eee;";
            div.innerHTML = `<img src="${img}" style="width:100%; height:100%; object-fit:cover;"><span style="position:absolute; top:2px; right:2px; cursor:pointer; background:rgba(0,0,0,0.5); color:white; width:18px; height:18px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-size:12px;" onclick="removeImage(${idx})">×</span>`;
            previewArea.appendChild(div);
        });
    };
    window.removeImage = (idx) => { currentImages.splice(idx, 1); updatePreview(); };

    const openBtn = document.getElementById('openPostModalBtn'); if(openBtn) openBtn.onclick = () => { if(postModal) postModal.classList.remove('hidden'); if(timelineInput) timelineInput.focus(); };
    const closeBtn = document.getElementById('closePostModal'); if(closeBtn) closeBtn.onclick = () => { if(postModal) postModal.classList.add('hidden'); };
    
    const postBtn = document.getElementById('postTimelineBtn');
    if(postBtn) postBtn.onclick = async () => {
        if(!timelineInput.value && currentImages.length === 0) return;
        try {
            postBtn.disabled = true; postBtn.innerHTML = "送信中...";
            if (!currentUser || !currentCircle) throw new Error("ログイン情報を再確認してください。");

            const db = await callBackend({ action: 'getAllCircles' });
            let aiComment = null;
            if (currentImages.length > 0) {
                if (!db.masterConfig?.aiKey) {
                    showToast("⚠️ APIキーが未設定のため、AI解析をスキップします。設定からキーを入力してください。", "error");
                } else {
                    showToast("AIが画像からデータを読み取り中...");
                    const ocrPrompt = "画像を見て攻略情報を抽出してください。もし『総獲得ファン数』が映っていれば、その数値だけを必ず1行目に『【FAN_COUNT】: 123456789』という形式で書いてください。カンマは含めても含めなくても良いです。";
                    aiComment = await callGemini(db.masterConfig.aiKey, ocrPrompt, currentImages);
                    
                    if (aiComment) {
                        // 強力な数値抽出 (1,234,567人 や 1234567 等に対応)
                        const fanMatch = aiComment.match(/【FAN_COUNT】:\s*([0-9,]+)/);
                        if (fanMatch) {
                            const rawValue = fanMatch[1].replace(/,/g, '');
                            const extractedFans = parseInt(rawValue) || 0;
                            if (extractedFans > 0) {
                                await callBackend({ action: 'updateFans', circleId: currentCircle.id, fans: extractedFans });
                                showToast(`実績を同期しました: ${extractedFans.toLocaleString()}人`);
                            }
                        }
                    } else {
                        showToast("AI解析に失敗しました。通信環境を確認してください。", "error");
                    }
                }
            }
            
            const res = await callBackend({ 
                action: 'postTimeline', 
                circleId: currentCircle.id, 
                userName: currentUser.name, 
                text: timelineInput.value || (aiComment ? "#AIデータ化送信" : "#スクショ投稿"), 
                images: currentImages, 
                aiComment: aiComment 
            });
            
            if(res.success) {
                timelineInput.value = ''; currentImages = []; updatePreview(); 
                if(postModal) postModal.classList.add('hidden'); 
                await updateDataAndUI();
                showToast("パドックに投稿しました！");
            } else { throw new Error(res.error || "送信失敗"); }
        } catch(e) {
            showToast(`送信失敗: ${e.message}`, "error");
        } finally { if(postBtn){ postBtn.disabled = false; postBtn.innerHTML = '<span class="material-icons-outlined" style="margin-right:8px;">send</span> 送信'; } }
    };

    if(timelineInput) timelineInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if(postBtn) postBtn.click(); } };

    // --- Paste & Drag ---
    let lastClickedElement = null;
    document.addEventListener('mousedown', (e) => { lastClickedElement = e.target; });

    window.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        const isModalOpen = postModal && !postModal.classList.contains('hidden');
        const isPaddockTarget = isModalOpen || (document.activeElement && document.activeElement.id === 'timelineInput') || (lastClickedElement && lastClickedElement.closest('#timelineCard'));

        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = async (re) => {
                    const compressed = await compressImage(re.target.result);
                    
                    // --- 超速AI解析 (貼り付けた瞬間に開始) ---
                    (async () => {
                        const db = await callBackend({ action: 'getAllCircles' });
                        if (db.masterConfig?.aiKey) {
                            showToast("AIがファン数をスキャン中...");
                            const fanPrompt = "このスクショから『ファン数』の数値だけを抽出し、数字のみで回答してください。見当たらなければ 0 と答えてください。";
                            const res = await callGemini(db.masterConfig.aiKey, fanPrompt, [compressed]);
                            const f = parseInt((res || "0").replace(/[^0-9]/g, '')) || 0;
                            if (f > 0) {
                                await callBackend({ action: 'updateFans', circleId: currentCircle.id, fans: f });
                                updateDataAndUI();
                                showToast(`✨ 実績を即座に更新しました: ${f.toLocaleString()}人`);
                                if (f >= 3000000) launchConfetti();
                            }
                        }
                    })();

                    if (isPaddockTarget) {
                        if(!isModalOpen && postModal) postModal.classList.remove('hidden');
                        if(currentImages.length < 4){ currentImages.push(compressed); updatePreview(); if(timelineInput) timelineInput.focus(); }
                    }
                };
                reader.readAsDataURL(blob);
            }
        }
        // --- Drag & Drop Support ---
    const setupDropZone = (el, isPaddock) => {
        if(!el) return;
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', async (e) => {
            e.preventDefault();
            el.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            for(let f of files) {
                const r = new FileReader();
                r.onload = async (re) => {
                    const compressed = await compressImage(re.target.result);
                    if (isPaddock) {
                        if(postModal) postModal.classList.remove('hidden');
                        if(currentImages.length < 4){ currentImages.push(compressed); updatePreview(); if(timelineInput) timelineInput.focus(); }
                    } else {
                        const db = await callBackend({ action: 'getAllCircles' });
                        if (db.masterConfig?.aiKey) {
                            showToast("AIがファン数を読み取り中...");
                            const res = await callGemini(db.masterConfig.aiKey, "ファン数のみ抽出して数字で答えて", [compressed]);
                            const fans = parseInt((res || "0").replace(/[^0-9]/g, '')) || 0;
                            if(fans > 0) { await callBackend({action:'updateFans', circleId:currentCircle.id, fans: fans}); updateDataAndUI(); showToast(`ファン数更新: ${fans.toLocaleString()}人`); }
                        }
                    }
                };
                r.readAsDataURL(f);
            }
        });
    };
    setupDropZone(document.getElementById('heroCard'), false);
    setupDropZone(document.getElementById('timelineCard'), true);




    const attachBtn = document.getElementById('attachImgBtn'); if(attachBtn) attachBtn.onclick = () => { const i = document.getElementById('timelineImageInput'); if(i) i.click(); };
    const tInput = document.getElementById('timelineImageInput'); if(tInput) tInput.onchange = (e) => {
        const f = e.target.files[0];
        if(f) { const r = new FileReader(); r.onload = async (re) => { const compressed = await compressImage(re.target.result); if(currentImages.length < 4){ currentImages.push(compressed); updatePreview(); } }; r.readAsDataURL(f); }
    };

    // --- Other Nav ---
    const statsBtn = document.getElementById('statsBtn'); if(statsBtn) statsBtn.onclick = (e) => { e.preventDefault(); const m = document.getElementById('masterStatsOverlay'); if(m) m.classList.remove('hidden'); generateAIAnalysis(); };
    const closeStats = document.getElementById('closeStatsBtn'); if(closeStats) closeStats.onclick = () => { const m = document.getElementById('masterStatsOverlay'); if(m) m.classList.add('hidden'); };
    const switchBtn = document.getElementById('switchCircleBtn'); if(switchBtn) switchBtn.onclick = showPortal;
    const adminBtn = document.getElementById('adminBtn'); 
    if(adminBtn) adminBtn.onclick = (e) => { 
        e.preventDefault(); 
        const am = document.getElementById('admin-modal'); 
        if(am) {
            am.classList.remove('hidden');
            renderAdminMembers(); // 管理用名簿を表示
        }
    };

    function renderAdminMembers() {
        const list = document.getElementById('adminMemberList'); if(!list || !currentCircle) return;
        list.innerHTML = '';
        const uid = currentUser?.id || 'guest';
        const isOwner = (currentCircle.ownerId === uid || !currentCircle.ownerId);

        Object.keys(currentCircle.members || {}).forEach(mid => {
            const m = currentCircle.members[mid];
            const div = document.createElement('div');
            div.style = "display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid rgba(0,0,0,0.05);";
            
            let actionBtn = "";
            if (isOwner && mid !== uid) {
                actionBtn = `<button class="glass-btn primary" style="font-size:10px; padding:4px 10px;" onclick="transferLeader('${mid}', '${m.name}')">👑 譲渡</button>`;
            } else if (mid === currentCircle.ownerId || (mid === 'guest' && !currentCircle.ownerId)) {
                actionBtn = `<span style="font-size:10px; color:var(--primary); font-weight:bold;">👑 リーダー</span>`;
            }

            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="member-avatar-mini" style="background-image:url('${m.icon || ''}'); background-size:cover; width:30px; height:30px;">${m.icon ? '' : m.name.substring(0,1)}</div>
                    <div>
                        <div style="font-weight:bold; font-size:12px;">${m.name}</div>
                        <div style="font-size:10px; color:var(--text-muted);">${(m.totalFans || 0).toLocaleString()} ファン</div>
                    </div>
                </div>
                ${actionBtn}
            `;
            list.appendChild(div);
        });
    }

    window.transferLeader = async (targetId, targetName) => {
        if (confirm(`リーダー権限を ${targetName} さんへ譲渡します。よろしいですか？\n※譲渡するとあなたはこの管理画面を操作できなくなります。`)) {
            await callBackend({ action: 'transferOwner', circleId: currentCircle.id, newOwnerId: targetId });
            showToast(`${targetName} さんへリーダー権限を譲渡しました`);
            const am = document.getElementById('admin-modal');
            if(am) am.classList.add('hidden');
            updateDataAndUI();
        }
    };

    // --- Core Functions ---
    function renderGrowthChart() {
        const ctx = document.getElementById('growthChart'); if(!ctx || !currentCircle) return;
        const my = currentCircle.members[currentUser.id] || { history: [] };
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: my.history.map((_,i)=>`Day ${i+1}`), datasets: [{ label: 'ファン数推移', data: my.history, borderColor: '#fba1ba', backgroundColor: 'rgba(251,161,186,0.1)', fill: true, tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, grid: { color: 'rgba(0,0,0,0.03)' } }, x: { grid: { display: false } } } }
        });
    }

    function launchConfetti() {
        for(let i=0; i<50; i++) {
            const c = document.createElement('div'); c.style = `position:fixed; width:10px; height:10px; background:hsl(${Math.random()*360},70%,70%); left:${Math.random()*100}%; top:-10px; z-index:9999; border-radius:3px; pointer-events:none;`;
            document.body.appendChild(c);
            const a = c.animate([{ transform: 'translateY(0) rotate(0)', opacity: 1 }, { transform: `translateY(${window.innerHeight}px) rotate(${Math.random()*720}deg)`, opacity: 0 }], { duration: 2000 + Math.random()*3000, easing: 'cubic-bezier(0,1,1,1)' });
            a.onfinish = () => c.remove();
        }
    }

    // --- Invite URL Logic (一気に加入させる魔法) ---
    const copyInviteBtn = document.getElementById('copyInviteUrlBtn');
    if(copyInviteBtn) copyInviteBtn.onclick = () => {
        if(!currentCircle) return;
        const base = window.location.origin + window.location.pathname;
        const inviteUrl = `${base}?join=${currentCircle.id}`;
        const display = document.getElementById('inviteUrlDisplay');
        if(display) display.value = inviteUrl;
        
        navigator.clipboard.writeText(inviteUrl).then(() => {
            showToast("招待URLをコピーしました！");
        });
    };


    // --- Admin Event Listeners ---
    const closeAdminCover = document.getElementById('closeAdmin');
    if(closeAdminCover) closeAdminCover.onclick = () => { const am = document.getElementById('admin-modal'); if(am) am.classList.add('hidden'); };

    const saveAdminBtn = document.getElementById('saveAdminBtn');
    if(saveAdminBtn) saveAdminBtn.onclick = async () => {
        const newName = document.getElementById('adminCircleNameInput').value;
        await callBackend({ action: 'updateConfig', name: newName });
        
        // 保存したら閉じる
        const am = document.getElementById('admin-modal');
        if(am) am.classList.add('hidden');
        
        showToast('設定を保存しました');
        updateDataAndUI();
    };

    const applyTargetBtn = document.getElementById('applyIndividualTargetBtn');
    if(applyTargetBtn) applyTargetBtn.onclick = async () => {
        const target = parseInt(document.getElementById('adminIndividualTarget').value) || 3000000;
        
        // 実際にバックエンドへ命令を送り、全メンバーのノルマを書き換える
        await callBackend({ action: 'updateAllTargets', target: target });
        
        const am = document.getElementById('admin-modal');
        if(am) am.classList.add('hidden');
        showToast(`全員のファン数目標を ${target.toLocaleString()}人に設定し、保存しました！`);
        updateDataAndUI();
    };

    async function generateAIAnalysis() {
        const area = document.getElementById('aiAnalysisResult'); if(!area) return;
        area.innerHTML = '<div class="loading-spinner"></div> 分析中...';
        const db = await callBackend({ action: 'getAllCircles' });
        if(!db.masterConfig?.aiKey) { area.innerHTML = "⚠️ システム管理者がGemini APIキーを設定していません。"; return; }
        const my = currentCircle.members[currentUser.id] || { totalFans: 0, targetFans: 3000000 };
        const progress = Math.floor((my.totalFans / my.targetFans) * 100);
        const p = `ウマ娘のサークルメンバーへのアドバイスをお願いします。現在ファン数は目標の${progress}%に達しています。ポジティブでモチベーションが上がるアドバイスを150文字以内でください。`;
        const advice = await callGemini(db.masterConfig.aiKey, p);
        area.innerHTML = advice || "分析に失敗しました。時間をおいて試してください。";
    }
});

async function callBackend(p) {
    if (GAS_ENDPOINT && p.action === 'postTimeline') {
        try {
            fetch(GAS_ENDPOINT, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ ...p, currentUser: currentUser }) });
        } catch (e) { console.error("GAS Push Error:", e); }
    }

    let db = JSON.parse(localStorage.getItem(DB_KEY));
    if (!db) { 
        db = { circles: {}, userToCircles: {}, globalWisdom: [], masterConfig: { aiKey: 'AIzaSyAzQdz599McEjgJkwN2tGJbfpWNfKIkCSg' } }; 
    }
    // 既存データがあってもキーが空なら自動セット
    if (db.masterConfig && !db.masterConfig.aiKey) {
        db.masterConfig.aiKey = 'AIzaSyAzQdz599McEjgJkwN2tGJbfpWNfKIkCSg';
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    }
    if (!db.circles['circle-1']) { 
        db.circles['circle-1'] = { id: 'circle-1', name: 'NPC@サークル', members: {}, timeline: [], ownerId: 'guest' }; 
    }

    if (p.action === 'init' || p.action === 'getAllCircles') return db;
    
    let cid = p.circleId || (currentCircle ? currentCircle.id : 'circle-1');
    if (!db.circles[cid]) cid = 'circle-1';
    let targetCircle = db.circles[cid];

    // --- 鉄壁の初期化ガード (属性の存在を100%保証) ---
    if (!targetCircle) {
        targetCircle = db.circles[cid] = { id: cid, name: '新規サークル', members: {}, timeline: [] };
    }
    if (!targetCircle.members) targetCircle.members = {};
    if (!targetCircle.timeline) targetCircle.timeline = [];

    if (p.action === 'getCircleData') return { success: true, circle: targetCircle };
    if (p.action === 'updateConfig') { targetCircle.name = p.name; localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true }; }
    if (p.action === 'updateMasterConfig') { if(!db.masterConfig) db.masterConfig = { aiKey: '' }; db.masterConfig.aiKey = p.aiKey; localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true }; }
    
    if (p.action === 'postTimeline') {
        targetCircle.timeline.push({ userName: p.userName || 'Unknown', text: p.text || '', time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), images: p.images || [], aiComment: p.aiComment });
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(db));
            return { success: true };
        } catch(e) {
            for (let circ of Object.values(db.circles)) {
                if (circ.timeline && circ.timeline.length > 3) {
                    for (let i = 0; i < circ.timeline.length - 2; i++) { circ.timeline[i].images = []; }
                }
            }
            localStorage.setItem(DB_KEY, JSON.stringify(db));
            return { success: true };
        }
    }
    
    if (p.action === 'updateFans') {
        const uid = currentUser?.id || 'guest';
        let m = targetCircle.members[uid]; 
        if(!m) m = targetCircle.members[uid] = { name: (currentUser?.name || 'Guest'), totalFans: 0, targetFans: 3000000, history: [], icon: (currentUser?.avatar || '') };
        m.totalFans = parseInt(p.fans) || 0; 
        if(!m.history) m.history = [];
        m.history.push(m.totalFans);
        targetCircle.totalFans = Object.values(targetCircle.members).reduce((s,x)=>s+(parseInt(x.totalFans)||0), 0); 
        localStorage.setItem(DB_KEY, JSON.stringify(db)); 
        return { success: true };
    }

    if (p.action === 'updateAllTargets') {
        targetCircle.defaultTarget = p.target; // サークル全体の標準目標を更新
        Object.values(targetCircle.members).forEach(m => { m.targetFans = p.target; });
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return { success: true };
    }

    if (p.action === 'joinCircle') {
        if (!db.userToCircles[currentUser.id]) db.userToCircles[currentUser.id] = [];
        if (!db.userToCircles[currentUser.id].includes(p.circleId)) {
            db.userToCircles[currentUser.id].push(p.circleId);
        }
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return { success: true };
    }

    if (p.action === 'createCircle') {
        const cid = 'circle-' + Date.now();
        const uid = currentUser?.id || 'guest';
        db.circles[cid] = { 
            id: cid, 
            name: p.name, 
            members: {}, 
            timeline: [], 
            ownerId: uid,
            defaultTarget: 3000000 
        };
        // 自分自身をメンバーに追加
        db.circles[cid].members[uid] = { 
            name: (currentUser?.name || 'Trainer'), 
            totalFans: 0, 
            targetFans: 3000000, 
            history: [], 
            icon: (currentUser?.avatar || '') 
        };
        if (!db.userToCircles[uid]) db.userToCircles[uid] = [];
        db.userToCircles[uid].push(cid);
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return { success: true, circleId: cid };
    }

    if (p.action === 'transferOwner') {
        targetCircle.ownerId = p.newOwnerId;
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return { success: true };
    }
    
    return db;
}
