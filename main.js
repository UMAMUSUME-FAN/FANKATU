const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = ''; 
let DISCORD_CLIENT_ID = '1497168159210340484';

let currentUser = null;
let currentCircle = null;

// --- DOM References ---
document.addEventListener('DOMContentLoaded', async () => {
    const authOverlay = document.getElementById('authOverlay');
    const portalOverlay = document.getElementById('circleSelectionOverlay');
    const appWrapper = document.getElementById('appWrapper');
    const masterStatsOverlay = document.getElementById('masterStatsOverlay');

    await callBackend({ action: 'init' });
    
    // Auth Check
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
            const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
            const du = await userRes.json();
            currentUser = { id: du.id, name: du.username, avatar: `https://cdn.discordapp.com/avatars/${du.id}/${du.avatar}.png` };
            authOverlay.classList.add('hidden');
            showPortal();
        } catch(e) { console.error("Auth Fail", e); }
    }

    async function showPortal() {
        portalOverlay.classList.remove('hidden');
        document.getElementById('portalUserName').textContent = currentUser.name;
        const ava = document.getElementById('portalUserAvatar'); if(currentUser.avatar) ava.style.backgroundImage = `url('${currentUser.avatar}')`;
        renderPortalCircles();
    }

    async function renderPortalCircles() {
        const db = await callBackend({ action: 'getAllCircles' });
        const myList = document.getElementById('myCirclesList'); myList.innerHTML = '';
        const resultsList = document.getElementById('searchResultsList'); resultsList.innerHTML = '';
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
            const isPending = c.joinRequests && c.joinRequests.includes(currentUser.id);
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right; background:${isPending?'#ccc':''}">${isPending?'Pending':'Join'}</span>`;
            if(!isPending) div.onclick = () => requestJoinCircle(cid); resultsList.appendChild(div);
        });
    }

    async function loginToCircle(cid) {
        const res = await callBackend({ action: 'getCircleData', circleId: cid });
        if (res.success) {
            currentCircle = res.circle;
            portalOverlay.classList.add('hidden');
            appWrapper.style.display = 'flex';
            document.getElementById('userNameDisplay').textContent = currentUser.name;
            const ua = document.getElementById('userAvatar'); if(currentUser.avatar) ua.style.backgroundImage = `url('${currentUser.avatar}')`;
            updateDashboard();
        }
    }

    async function requestJoinCircle(cid) {
        await callBackend({ action: 'requestJoin', circleId: cid, userId: currentUser.id });
        showToast('参加申請を送りました！'); renderPortalCircles();
    }

    function updateDashboard() {
        document.getElementById('circleNameDisplay').textContent = currentCircle.name;
        const my = currentCircle.members[currentUser.id] || { totalFans: 0, targetFans: 3000000, history: [] };
        document.getElementById('displayTotalTarget').textContent = my.targetFans.toLocaleString();
        document.getElementById('displayRemaining').textContent = Math.max(0, my.targetFans - my.totalFans).toLocaleString();
        document.getElementById('totalFanProgress').style.width = Math.min(100, (my.totalFans / my.targetFans) * 100) + '%';
        document.getElementById('totalFanPercentText').textContent = Math.floor((my.totalFans / my.targetFans) * 100) + '%';
        
        const dlink = document.getElementById('circleDiscordLink');
        if(currentCircle.discordInvite) { dlink.href = currentCircle.discordInvite; dlink.style.display = 'flex'; }
        else dlink.style.display = 'none';

        renderGrowthChart();
        renderMembers();
        renderTimeline();
        renderAIWisdom();
    }

    function renderMembers() {
        const g = document.getElementById('membersGrid'); g.innerHTML = '';
        Object.keys(currentCircle.members).forEach(uid => {
            const m = currentCircle.members[uid];
            const d = document.createElement('div'); d.className = 'member-avatar-mini';
            if(m.icon) d.style.backgroundImage = `url('${m.icon}')`; else d.textContent = m.name.substring(0,1);
            d.onclick = () => showMemberDetails(uid);
            g.appendChild(d);
        });
    }

    let currentTagFilter = null;

    function renderTimeline() {
        const list = document.getElementById('timelineList'); list.innerHTML = '';
        let posts = currentCircle.timeline || [];
        
        // Tag Filtering
        if (currentTagFilter) {
            posts = posts.filter(p => p.text.includes(currentTagFilter));
            const clearBtn = document.createElement('div');
            clearBtn.innerHTML = `<button class="glass-btn" style="width:100%; font-size:12px; margin-bottom:10px; background:rgba(0,0,0,0.05);">絞り込み中: ${currentTagFilter} (解除)</button>`;
            clearBtn.onclick = () => { currentTagFilter = null; renderTimeline(); };
            list.appendChild(clearBtn);
        }

        posts.slice().reverse().forEach(p => {
            const div = document.createElement('div'); div.className = 'timeline-item';
            
            // Linkify Hashtags
            const linkedText = p.text.replace(/#(\S+)/g, '<span class="hashtag" style="color:var(--discord-blue); cursor:pointer; font-weight:bold;">#$1</span>');
            
            let imgHtml = p.image ? `<img src="${p.image}" style="width:100%; border-radius:10px; margin-top:10px; border:1px solid #eee;">` : '';
            let aiHtml = p.aiComment ? `<div style="margin-top:10px; padding:10px; background:#f0f7ff; border-radius:10px; font-size:12px; border-left:3px solid #5865F2;"><b>✨ AI分析:</b> ${p.aiComment}</div>` : '';
            
            div.innerHTML = `<div class="timeline-header"><span class="timeline-user">${p.userName}</span><span class="timeline-time">${p.time}</span></div><div class="timeline-content">${linkedText}</div>${imgHtml}${aiHtml}`;
            
            // Add click events to hashtags
            div.querySelectorAll('.hashtag').forEach(tagEl => {
                tagEl.onclick = (e) => {
                    e.stopPropagation();
                    currentTagFilter = tagEl.textContent;
                    renderTimeline();
                };
            });

            list.appendChild(div);
        });
    }

    function renderAIWisdom() {
        const area = document.getElementById('aiWisdomContent');
        if (!currentCircle.wisdom || currentCircle.wisdom.length === 0) {
            area.innerHTML = "パドックにつぶやいてみましょう。AIが攻略情報を『継承』し、自動でWiki化します。"; return;
        }
        const cats = { 'ステータス': 'trending_up', '脚質': 'directions_run', '戦略': 'psychology', 'レース': 'flag' };
        area.innerHTML = currentCircle.wisdom.map(w => `
            <div class="wisdom-tip" style="display:flex; gap:10px; align-items:flex-start;">
                <span class="material-icons-outlined" style="font-size:16px; color:var(--secondary);">${cats[w.category] || 'shutter_speed'}</span>
                <div><span class="wisdom-tag">${w.category}</span><span style="font-weight:600; font-size:13px;">${w.text}</span></div>
            </div>
        `).join('');
    }

    async function showMemberDetails(uid) {
        const m = currentCircle.members[uid]; if (!m) return;
        alert(`${m.name} さんの状況:\n目標達成率: ${(m.totalFans / m.targetFans * 100).toFixed(1)}%\n「現在のエースとしての風格が出ていますね！」 by AI Secretary`);
    }

    async function generateAIAnalysis() {
        const area = document.getElementById('aiMessageArea'); area.innerHTML = "AIが思考中...";
        if (currentCircle.aiKey) {
            const prompt = `サークル「${currentCircle.name}」の分析をして。全体達成率 ${(currentCircle.totalFans/1000000).toFixed(1)}Mファン突破。`;
            const result = await callGemini(currentCircle.aiKey, prompt);
            area.innerHTML = result;
        } else { area.innerHTML = "APIキー未設定。順調なペースです！"; }
    }

    async function callGemini(key, prompt, imageBase64 = null) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
            const parts = [{ text: prompt }];
            if (imageBase64) {
                parts.push({ inline_data: { mime_type: "image/jpeg", data: imageBase64.split(',')[1] } });
            }
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts }] })
            });
            const data = await res.json();
            return data.candidates[0].content.parts[0].text;
        } catch (e) { return "AIが少しお疲れのようです。キーを確認してください。"; }
    }

    // --- Timeline Actions ---
    const imgInput = document.getElementById('timelineImageInput');
    const previewArea = document.getElementById('timelineImagePreview');
    let currentBase64 = null;

    document.getElementById('attachImgBtn').onclick = () => imgInput.click();
    imgInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
                currentBase64 = re.target.result;
                document.getElementById('previewImg').src = currentBase64;
                previewArea.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    };
    document.getElementById('removePreviewBtn').onclick = () => { currentBase64 = null; previewArea.style.display = 'none'; };

    document.getElementById('postTimelineBtn').onclick = async () => {
        const input = document.getElementById('timelineInput');
        if(!input.value && !currentBase64) return;
        
        let aiComment = null;
        if(currentCircle.aiKey && currentBase64) {
            showToast("AIが画像を解析中...");
            aiComment = await callGemini(currentCircle.aiKey, "このウマ娘の育成画面または編成画像を分析して、攻略に役立つアドバイスを100文字以内でして。", currentBase64);
        }

        await callBackend({ 
            action: 'postTimeline', 
            circleId: currentCircle.id, 
            userName: currentUser.name, 
            text: input.value || (currentBase64 ? "画像をアップロードしました" : ""), 
            image: currentBase64,
            aiComment: aiComment
        });

        input.value = ''; currentBase64 = null; previewArea.style.display = 'none';
        updateDataAndUI();
    };

    // --- General Event Listeners ---
    document.getElementById('discordLoginBtn').onclick = () => {
        const r = window.location.origin + window.location.pathname;
        window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(r)}&response_type=token&scope=identify`;
    };
    document.getElementById('statsBtn').onclick = (e) => { e.preventDefault(); masterStatsOverlay.classList.remove('hidden'); generateAIAnalysis(); };
    document.getElementById('closeStatsBtn').onclick = () => masterStatsOverlay.classList.add('hidden');
    document.getElementById('switchCircleBtn').onclick = showPortal;
    document.getElementById('logoutBtn').onclick = () => window.location.href = window.location.pathname;
    document.getElementById('closeAdmin').onclick = () => document.getElementById('admin-modal').classList.add('hidden');
    document.getElementById('adminBtn').onclick = (e) => {
        e.preventDefault(); const p = prompt('Pass:');
        if(p === currentCircle.adminPass) { 
            document.getElementById('admin-modal').classList.remove('hidden'); 
            document.getElementById('adminCircleNameInput').value = currentCircle.name; 
            document.getElementById('adminAiKey').value = currentCircle.aiKey || ''; 
        }
    };
    document.getElementById('saveAdminBtn').onclick = async () => {
        const name = document.getElementById('adminCircleNameInput').value;
        const key = document.getElementById('adminAiKey').value;
        await callBackend({ action: 'updateConfig', circleId: currentCircle.id, name, aiKey: key });
        showToast("✅ 設定を保存しました！"); 
        setTimeout(() => document.getElementById('admin-modal').classList.add('hidden'), 1000);
        updateDataAndUI();
    };

    window.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const inc = Math.floor(Math.random() * 500000) + 100000;
                const oldM = currentCircle.members[currentUser.id] || { totalFans: 0, targetFans: 3000000 };
                const newFans = oldM.totalFans + inc;
                await callBackend({ action: 'updateFans', circleId: currentCircle.id, fans: newFans });
                if (oldM.totalFans < oldM.targetFans && newFans >= oldM.targetFans) {
                    launchConfetti();
                    showToast("🎉 目標達成！！素晴らしいです！！", "success");
                } else { showToast(`${(inc/10000).toFixed(1)}万ファン獲得！`); }
                updateDataAndUI();
            }
        }
    });

    function launchConfetti() {
        for(let i=0;i<60;i++) {
            const c=document.createElement('div'); c.className='confetti';
            c.style.left=Math.random()*100+'vw'; c.style.backgroundColor=['#fba1ba','#e0c384','#fff'][Math.floor(Math.random()*3)];
            c.style.animationDelay=Math.random()*2+'s'; document.body.appendChild(c);
            setTimeout(()=>c.remove(),4000);
        }
    }
    function showToast(m, t='success'){ const s=document.getElementById('toast'); s.textContent=m; s.className=`toast show ${t}`; setTimeout(()=>s.classList.remove('show'),3000); }
    async function updateDataAndUI(){ const res=await callBackend({action:'getCircleData', circleId:currentCircle.id}); currentCircle=res.circle; updateDashboard(); }

    let growthChart = null;
    function renderGrowthChart() {
        const ctx = document.getElementById('growthChart').getContext('2d'); if(growthChart) growthChart.destroy();
        const myData = currentCircle.members[currentUser.id]?.history || [10, 20, 30, 45, 55];
        growthChart = new Chart(ctx, { type: 'line', data: { labels: ['1週','2週','3週','4週','今日'], datasets: [{ data: myData, borderColor:'#fba1ba', fill:true, backgroundColor:'rgba(251,161,186,0.1)', tension:0.4 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} } });
    }
});

async function callBackend(p) {
    let db = JSON.parse(localStorage.getItem(DB_KEY));
    if (!db) { db = { circles: { 'circle-1': { id: 'circle-1', name: 'NPC@サークル', adminId: 'admin', adminPass: '1234', totalFans: 1500000, members: { 'npc-1': { name: 'NPC', totalFans: 500000, targetFans: 3000000, history: [10, 20, 30] } }, timeline: [], wisdom: [] } }, userToCircles: {} }; localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    if (p.action === 'init' || p.action === 'getAllCircles') return db;
    if (p.action === 'getCircleData') return { success: true, circle: db.circles[p.circleId] };
    if (p.action === 'updateConfig') { db.circles[p.circleId].name = p.name; db.circles[p.circleId].aiKey = p.aiKey; localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true }; }
    if (p.action === 'postTimeline') {
        const c = db.circles[p.circleId]; if(!c.timeline) c.timeline = [];
        c.timeline.push({ userName: p.userName, text: p.text, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), image: p.image, aiComment: p.aiComment });
        const k={'スタミナ':'ステータス','スピード':'ステータス','根性':'ステータス','逃げ':'脚質','先行':'脚質','因子':'育成','継承':'育成'};
        for(let x in k) if(p.text.includes(x)) { if(!c.wisdom) c.wisdom = []; if(!c.wisdom.some(w=>w.text===p.text)) c.wisdom.push({category: k[x], text: p.text}); }
        localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true };
    }
    if (p.action === 'updateFans') {
        const c = db.circles[p.circleId]; let m = c.members[currentUser.id]; if(!m) m = c.members[currentUser.id] = { name: currentUser.name, totalFans: 0, targetFans: 3000000, history: [], icon: currentUser.avatar };
        m.totalFans = p.fans; m.history.push(p.fans);
        c.totalFans = Object.values(c.members).reduce((s,x)=>s+x.totalFans, 0); localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true };
    }
    return db;
}
