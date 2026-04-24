// --- サーバー側のデータベース処理 (Google Apps Script) ---
// これを Google Apps Script (Code.gs) に貼り付けてデプロイしてください

const PROP_KEY = 'UMA_TRACKER_DB_V2';

function doPost(e) {
  const prop = PropertiesService.getScriptProperties();
  // DBの読み込み
  let db = JSON.parse(prop.getProperty(PROP_KEY) || '{"circles":{}, "userToCircles":{}, "globalWisdom":[], "masterConfig":{"aiKey":"AIzaSyAzQdz599McEjgJkwN2tGJbfpWNfKIkCSg"}}');
  
  const p = JSON.parse(e.postData.contents);
  const action = p.action;
  const user = p.currentUser;
  let success = true;

  // デフォルトサークルの保証
  if (!db.circles['circle-1']) {
    db.circles['circle-1'] = { id: 'circle-1', name: 'NPC@サークル', members: {}, timeline: [], ownerId: 'guest' };
  }
  if (!db.userToCircles) db.userToCircles = {};

  try {
    if (action === 'init' || action === 'getAllCircles') {
      // 取得のみ
    } else if (action === 'getCircleData') {
      // 取得のみ
    } else if (action === 'findCircleByCode') {
      const found = Object.values(db.circles).find(c => c.inviteCode === p.code);
      return returnJSON({ success: !!found, circleId: found ? found.id : null, db: db });
    } else if (action === 'updateConfig') {
      const c = db.circles[p.circleId];
      if (c) {
        if(p.name) c.name = p.name;
        if(p.inviteCode) c.inviteCode = p.inviteCode;
        if(p.circleTotalTarget !== undefined) c.circleTotalTarget = p.circleTotalTarget;
      }
    } else if (action === 'postTimeline') {
      const c = db.circles[p.circleId];
      if (c && user) {
        c.timeline.push({ 
          userName: user.name, 
          text: p.text || "#スクショ投稿", 
          time: new Date().toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'}), 
          images: p.images || [], 
          aiComment: p.aiComment 
        });
        if (c.timeline.length > 50) c.timeline = c.timeline.slice(-50);
      }
    } else if (action === 'updateFans') {
      const c = db.circles[p.circleId];
      if (c && user) {
        let m = c.members[user.id];
        if(!m) m = c.members[user.id] = { name: user.name, totalFans: 0, targetFans: 3000000, history: [], icon: user.avatar };
        m.totalFans = parseInt(p.fans);
        if(!m.history) m.history = [];
        m.history.push(m.totalFans);
        if(m.history.length > 30) m.history.shift();
      }
    } else if (action === 'updateAllTargets') {
      const c = db.circles[p.circleId];
      if (c) {
        c.defaultTarget = p.target;
        Object.values(c.members).forEach(m => m.targetFans = p.target);
      }
    } else if (action === 'updateSingleMemberTarget') {
      const c = db.circles[p.circleId];
      if (c && c.members[p.memberId]) c.members[p.memberId].targetFans = p.target;
    } else if (action === 'joinCircle') {
      if (user) {
        if (!db.userToCircles[user.id]) db.userToCircles[user.id] = [];
        if (!db.userToCircles[user.id].includes(p.circleId)) db.userToCircles[user.id].push(p.circleId);
        // メンバー一覧にも追加
        const c = db.circles[p.circleId];
        if (c && !c.members[user.id]) {
          c.members[user.id] = { name: user.name, totalFans: 0, targetFans: c.defaultTarget || 3000000, history: [], icon: user.avatar };
        }
      }
    } else if (action === 'createCircle') {
      const cid = 'circle-' + Date.now();
      db.circles[cid] = { 
        id: cid, 
        name: p.name, 
        members: {}, 
        timeline: [], 
        ownerId: user ? user.id : 'guest', 
        defaultTarget: 3000000,
        inviteCode: Math.random().toString(36).substring(2, 10).toUpperCase()
      };
      if (user) {
        db.circles[cid].members[user.id] = { name: user.name, totalFans: 0, targetFans: 3000000, history: [], icon: user.avatar };
        if (!db.userToCircles[user.id]) db.userToCircles[user.id] = [];
        db.userToCircles[user.id].push(cid);
      }
      db.lastCreatedId = cid;
    } else if (action === 'transferOwner') {
      if (db.circles[p.circleId]) db.circles[p.circleId].ownerId = p.newOwnerId;
    }
    
    // DBを保存
    prop.setProperty(PROP_KEY, JSON.stringify(db));
  } catch (err) {
    success = false;
    console.log(err);
  }

  return returnJSON({ success: success, db: db, lastCreatedId: db.lastCreatedId });
}

function returnJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 動作確認用
function doGet() {
  return ContentService.createTextOutput("UMA Tracker API is Running.");
}
