const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = ''; 
let DISCORD_CLIENT_ID = '1497168159210340484';

let currentUser = null;
let currentCircle = null;

// --- Helper Functions ---
function showToast(m, t='success'){ const s=document.getElementById('toast'); if(!s) return; s.textContent=m; s.className=`toast show ${t}`; setTimeout(()=>s.classList.remove('show'),3000); }
async function updateDataAndUI(){ if(!currentCircle) return; const res=await callBackend({action:'getCircleData', circleId:currentCircle.id}); currentCircle=res.circle; updateDashboard(); }

// --- DOM References ---
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
    
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
            const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
            const du = await userRes.json();
            currentUser = { id: du.id, name: du.username, avatar: `https://cdn.discordart.com/avatars/${du.id}/${du.avatar}.png` };
            if(authOverlay) authOverlay.classList.add('hidden');
            showPortal();
        } catch(e) { console.error("Auth Fail", e); }
    }

    async function showPortal() {
        if(!portalOverlay) return;
        portalOverlay.classList.remove('hidden');
        const pName = document.getElementById('portalUserName'); if(pName) pName.textContent = currentUser.name;
        const ava = document.getElementById('portalUserAvatar'); if(currentUser.avatar && ava) ava.style.backgroundImage = `url('${currentUser.avatar}')`;
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
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right;">Enter</span>`;
            div.onclick = () => loginToCircle(cid); myList.appendChild(div);
        });
        Object.keys(db.circles).forEach(cid => {
            if (userToCircles.includes(cid)) return;
            const c = db.circles[cid];
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style.marginBottom = '10px';
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right;">Join</span>`;
            div.onclick = () => showToast("現在、参加申請は受け付けていません"); resultsList.appendChild(div);
        });
    }

    async function loginToCircle(cid) {
        const res = await callBackend({ action: 'getCircleData', circleId: cid });
        if (res.success) {
            currentCircle = res.circle;
            if(portalOverlay) portalOverlay.classList.add('hidden');
            if(appWrapper) appWrapper.style.display = 'flex';
            const nameDisp = document.getElementById('userNameDisplay'); if(nameDisp) nameDisp.textContent = currentUser.name;
            const ua = document.getElementById('userAvatar'); if(currentUser.avatar && ua) ua.style.backgroundImage = `url('${currentUser.avatar}')`;
            updateDashboard();
        }
    }

    function updateDashboard() {
        if(!currentCircle) return;
        const cName = document.getElementById('circleNameDisplay'); if(cName) cName.textContent = currentCircle.name;
        const my = currentCircle.members[currentUser.id] || { totalFans: 0, targetFans: 3000000, history: [] };
        const dt = document.getElementById('displayTotalTarget'); if(dt) dt.textContent = my.targetFans.toLocaleString();
        const dr = document.getElementById('displayRemaining'); if(dr) dr.textContent = Math.max(0, my.targetFans - my.totalFans).toLocaleString();
        const tp = document.getElementById('totalFanProgress'); if(tp) tp.style.width = Math.min(100, (my.totalFans / my.targetFans) * 100) + '%';
        const tpt = document.getElementById('totalFanPercentText'); if(tpt) tpt.textContent = Math.floor((my.totalFans / my.targetFans) * 100) + '%';
        renderGrowthChart(); renderMembers(); renderTimeline(); renderAIWisdom();
    }

    function renderMembers() {
        const g = document.getElementById('membersGrid'); if(!g) return;
        g.innerHTML = '';
        Object.keys(currentCircle.members).forEach(uid => {
            const m = currentCircle.members[uid];
            const d = document.createElement('div'); d.className = 'member-avatar-mini';
            if(m.icon) d.style.backgroundImage = `url('${m.icon}')`; else d.textContent = m.name.substring(0,1);
            g.appendChild(d);
        });
    }

    let currentTagFilter = null;
    function renderTimeline() {
        const list = document.getElementById('timelineList'); if(!list) return;
        list.innerHTML = '';
        let posts = currentCircle.timeline || [];
        if (currentTagFilter) {
            posts = posts.filter(p => p.text.includes(currentTagFilter));
            const clearBtn = document.createElement('div');
            clearBtn.innerHTML = `<button class="glass-btn" style="width:100%; font-size:12px; margin-bottom:10px;">絞り込み中: ${currentTagFilter} (解除)</button>`;
            clearBtn.onclick = () => { currentTagFilter = null; renderTimeline(); };
            list.appendChild(clearBtn);
        }
        posts.slice().reverse().forEach(p => {
            const div = document.createElement('div'); div.className = 'timeline-item';
            const linkedText = p.text.replace(/#(\S+)/g, '<span class="hashtag">#$1</span>');
            let imagesHtml = (p.images || []).map(img => `<img src="${img}" style="width:calc(50% - 5px); border-radius:10px; border:1px solid #eee; object-fit:cover; aspect-ratio:16/9;">`).join('');
            let imageGrid = imagesHtml ? `<div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:10px;">${imagesHtml}</div>` : '';
            div.innerHTML = `<div class="timeline-header"><span class="timeline-user">${p.userName}</span><span class="timeline-time">${p.time}</span></div><div class="timeline-content">${linkedText}</div>${imageGrid}`;
            if(p.aiComment) div.innerHTML += `<div style="margin-top:10px; padding:10px; background:rgba(251,161,186,0.05); border-radius:10px; font-size:12px; border-left:3px solid var(--primary);"><b>✨ AI Secretary:</b> ${p.aiComment}</div>`;
            div.querySelectorAll('.hashtag').forEach(tagEl => { tagEl.onclick = (e) => { e.stopPropagation(); currentTagFilter = tagEl.textContent; renderTimeline(); }; });
            list.appendChild(div);
        });
    }

    async function renderAIWisdom() {
        const area = document.getElementById('aiWisdomContent'); if(!area) return;
        const db = await callBackend({ action: 'getAllCircles' });
        const wisdom = db.globalWisdom || [];
        let allTags = [];
        Object.values(db.circles).forEach(c => { (c.timeline || []).forEach(p => { const tags = p.text.match(/#(\S+)/g); if(tags) allTags.push(...tags); }); });
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
            img.onerror = () => resolve(base64); // エラー時は圧縮せずそのまま返す
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
            if (db.masterConfig?.aiKey && currentImages.length > 0) {
                showToast("AIが画像から戦略を分析中...");
                aiComment = await callGemini(db.masterConfig.aiKey, "この画像から攻略アドバイスを100文字以内でして。", currentImages);
            }
            
            const res = await callBackend({ 
                action: 'postTimeline', 
                circleId: currentCircle.id, 
                userName: currentUser.name, 
                text: timelineInput.value || "#スクショ投稿", 
                images: currentImages, 
                aiComment: aiComment 
            });
            
            if(res.success) {
                timelineInput.value = ''; currentImages = []; updatePreview(); 
                if(postModal) postModal.classList.add('hidden'); 
                updateDataAndUI();
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
        
        // モーダルが開いている時は「絶対」に掲示板優先、閉じてる時はクリック場所で判断
        const isPaddockTarget = isModalOpen || 
                                (document.activeElement && document.activeElement.id === 'timelineInput') || 
                                (lastClickedElement && lastClickedElement.closest('#timelineCard'));

        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = async (re) => {
                    const compressed = await compressImage(re.target.result);
                    if (isPaddockTarget) {
                        if(!isModalOpen && postModal) postModal.classList.remove('hidden');
                        if(currentImages.length < 4){ currentImages.push(compressed); updatePreview(); if(timelineInput) timelineInput.focus(); }
                    } else {
                        const inc = Math.floor(Math.random() * 500000) + 100000;
                        const my = currentCircle.members[currentUser.id] || { totalFans: 0, targetFans: 3000000 };
                        await callBackend({ action: 'updateFans', circleId: currentCircle.id, fans: my.totalFans + inc });
                        if (my.totalFans < 3000000 && (my.totalFans + inc) >= 3000000) launchConfetti();
                        showToast(`+${(inc/10000).toFixed(1)}万ファン獲得！ (OCR)`);
                        updateDataAndUI();
                    }
                };
                reader.readAsDataURL(blob);
            }
        }
    });

    const attachBtn = document.getElementById('attachImgBtn'); if(attachBtn) attachBtn.onclick = () => { const i = document.getElementById('timelineImageInput'); if(i) i.click(); };
    const tInput = document.getElementById('timelineImageInput'); if(tInput) tInput.onchange = (e) => {
        const f = e.target.files[0];
        if(f) { const r = new FileReader(); r.onload = async (re) => { const compressed = await compressImage(re.target.result); if(currentImages.length < 4){ currentImages.push(compressed); updatePreview(); } }; r.readAsDataURL(f); }
    };

    // --- Other Nav ---
    const statsBtn = document.getElementById('statsBtn'); if(statsBtn) statsBtn.onclick = (e) => { e.preventDefault(); const m = document.getElementById('masterStatsOverlay'); if(m) m.classList.remove('hidden'); generateAIAnalysis(); };
    const closeStats = document.getElementById('closeStatsBtn'); if(closeStats) closeStats.onclick = () => { const m = document.getElementById('masterStatsOverlay'); if(m) m.classList.add('hidden'); };
    const switchBtn = document.getElementById('switchCircleBtn'); if(switchBtn) switchBtn.onclick = showPortal;
    const adminBtn = document.getElementById('adminBtn'); if(adminBtn) adminBtn.onclick = (e) => { e.preventDefault(); const p = prompt('Leader PW:'); if(p === currentCircle.adminPass) { const am = document.getElementById('admin-modal'); if(am) am.classList.remove('hidden'); } };
});

async function callBackend(p) {
    let db = JSON.parse(localStorage.getItem(DB_KEY));
    if (!db) { db = { circles: { 'circle-1': { id: 'circle-1', name: 'NPC@サークル', adminId: 'admin', adminPass: '1234', totalFans: 1500000, members: { 'npc-1': { name: 'NPC', totalFans: 500000, targetFans: 3000000, history: [10, 20, 30] } }, timeline: [] } }, userToCircles: {}, globalWisdom: [], masterConfig: { aiKey: '' } }; localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    if (p.action === 'init' || p.action === 'getAllCircles') return db;
    if (p.action === 'getCircleData') return { success: true, circle: db.circles[p.circleId] };
    if (p.action === 'updateConfig') { db.circles[p.circleId].name = p.name; localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true }; }
    if (p.action === 'updateMasterConfig') { db.masterConfig.aiKey = p.aiKey; localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true }; }
    if (p.action === 'postTimeline') {
        const c = db.circles[p.circleId];
        if (!c) return { success: false, error: "サークルデータが見つかりません。再ログインしてください。" };
        if(!c.timeline) c.timeline = [];
        c.timeline.push({ userName: p.userName, text: p.text, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), images: p.images, aiComment: p.aiComment });
        const k={'スタミナ':'ステータス','スピード':'ステータス','根性':'ステータス','逃げ':'脚質','先行':'脚質','因子':'育成','継承':'育成','サポカ':'編成','賢さ':'ステータス'};
        for(let x in k) if(p.text.includes(x)) { if(!db.globalWisdom) db.globalWisdom = []; if(!db.globalWisdom.some(w=>w.text===p.text)) db.globalWisdom.push({category: k[x], text: p.text}); }
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(db));
            return { success: true };
        } catch(e) {
            throw new Error("保存容量がいっぱいです。古い投稿を削除するか、画像を減らして試してください。");
        }
    }
    if (p.action === 'updateFans') {
        const c = db.circles[p.circleId]; let m = c.members[currentUser.id]; if(!m) m = c.members[currentUser.id] = { name: currentUser.name, totalFans: 0, targetFans: 3000000, history: [], icon: currentUser.avatar };
        m.totalFans = p.fans; m.history.push(p.fans);
        c.totalFans = Object.values(c.members).reduce((s,x)=>s+x.totalFans, 0); localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true };
    }
    return db;
}
