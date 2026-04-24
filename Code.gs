// --- サーバー側のデータベース処理 (Google Apps Script 完全版) ---
// これを Google Apps Script (Code.gs) に「まるごと上書き」してデプロイしてください

const PROP_KEY = 'UMA_TRACKER_DB_V4';

function doPost(e) {
  const prop = PropertiesService.getScriptProperties();
  let db_str = prop.getProperty(PROP_KEY);
  let db = {circles:{}, userToCircles:{}, globalWisdom:[]};
  
  if (db_str) {
    try { db = JSON.parse(db_str); } catch(err) { console.log("JSON Parse Error"); }
  }

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
    if (action === 'createCircle') {
      const cid = 'circle-' + Date.now();
      db.circles[cid] = { 
        id: cid, name: p.name, members: {}, timeline: [], 
        ownerId: user ? user.id : 'guest', defaultTarget: 3000000,
        inviteCode: Math.random().toString(36).substring(2, 10).toUpperCase()
      };
      if (user) {
        db.circles[cid].members[user.id] = { name: user.name, totalFans: 0, targetFans: 3000000, history: [], icon: user.avatar };
        if (!db.userToCircles[user.id]) db.userToCircles[user.id] = [];
        db.userToCircles[user.id].push(cid);
      }
      db.lastCreatedId = cid;
    } else if (action === 'leaveCircle') {
      if (user && db.userToCircles[user.id]) {
        db.userToCircles[user.id] = db.userToCircles[user.id].filter(id => id !== p.circleId);
        const c = db.circles[p.circleId];
        if (c && c.members[user.id]) delete c.members[user.id];
      }
    } else if (action === 'joinCircle') {
      if (user && db.circles[p.circleId]) {
        if (!db.userToCircles[user.id]) db.userToCircles[user.id] = [];
        if (!db.userToCircles[user.id].includes(p.circleId)) db.userToCircles[user.id].push(p.circleId);
        const c = db.circles[p.circleId];
        if (!c.members[user.id]) c.members[user.id] = { name: user.name, totalFans: 0, targetFans: 3000000, history: [], icon: user.avatar };
      }
    } else if (action === 'updateFans') {
      const c = db.circles[p.circleId];
      if (c && user) {
        let m = c.members[user.id];
        if(!m) m = c.members[user.id] = { name: user.name, totalFans: 0, targetFans: 3000000, history: [], icon: user.avatar };
        m.totalFans = parseInt(p.fans);
        if(!m.history) m.history = []; m.history.push(m.totalFans);
        if(m.history.length > 20) m.history.shift();
      }
    } else if (action === 'postTimeline') {
      const c = db.circles[p.circleId];
      if (c && user) {
        c.timeline.push({ userName: user.name, text: p.text, time: new Date().toLocaleTimeString('ja-JP'), images: p.images || [] });
        if (c.timeline.length > 20) c.timeline.shift();
      }
    } else if (action === 'updateSingleMemberTarget') {
      const c = db.circles[p.circleId];
      if (c && c.members[p.memberId]) c.members[p.memberId].targetFans = p.target;
    } else if (action === 'updateConfig') {
      const c = db.circles[p.circleId];
      if (c) {
        if(p.name) c.name = p.name;
        if(p.circleTotalTarget !== undefined) c.circleTotalTarget = p.circleTotalTarget;
      }
    }

    // データの保存
    prop.setProperty(PROP_KEY, JSON.stringify(db));
    
  } catch (err) {
    success = false;
  }

  return ContentService.createTextOutput(JSON.stringify({ success: success, db: db, lastCreatedId: db.lastCreatedId }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() { return ContentService.createTextOutput("UMA Tracker API v4 is Active."); }
