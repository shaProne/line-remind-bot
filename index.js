/**********************
 *  必要モジュール
 **********************/
const express = require('express');
const line    = require('@line/bot-sdk');
const admin   = require('firebase-admin');

/**********************
 *  Firebase 初期化
 **********************/
let firebaseApp;

if (admin.apps.length === 0) {
  const cred = JSON.parse(
    Buffer.from(process.env.FIREBASE_CREDENTIAL_B64, 'base64')
  );
  firebaseApp = admin.initializeApp(
    { credential: admin.credential.cert(cred) },
    'remindApp'                    // ← 固有名を付けて重複回避
  );
} else {
  firebaseApp = admin.app('remindApp'); // ← 既存 App を再利用
}

const db = firebaseApp.firestore();

/**********************
 *  LINE SDK 設定
 **********************/
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret:      process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);
const app    = express();

/**********************
 *  日付キーを JST4:00 起点で作るヘルパ
 **********************/
const dayjs = require('dayjs');
require('dayjs/locale/ja');
require('dayjs/plugin/utc');
require('dayjs/plugin/timezone');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));

const dateKey = () => {
  const now = dayjs().tz('Asia/Tokyo');
  return now.hour() < 4 ? now.subtract(1, 'day').format('YYYY-MM-DD')
                        : now.format('YYYY-MM-DD');
};

/**********************
 *  Webhook エンドポイント
 **********************/
app.post('/webhook', line.middleware(config), async (req, res) => {
  await Promise.all(req.body.events.map(handleEvent));
  res.status(200).send('OK');
});

/**********************
 *  メインのイベント処理
 **********************/
async function handleEvent(event) {
  const uid = event.source.userId;

  /***** 友だち追加イベント *****/
  if (event.type === 'follow') {
    await db.collection('users').doc(uid).set({ status: 'WAIT_COUNT' });
    return reply(event, 'アーニャ、　鉄壁の　お手伝いする！　毎日 なんせくしょんやるか　数字で　教えろ。　ぜんぶ　すうじだけで　送らないと　アーニャ　反応してやらない');
  }

  /***** テキストメッセージのみ処理 *****/
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const text = event.message.text.trim();
  const ref  = db.collection('users').doc(uid);
  const doc  = await ref.get();
  const user = doc.exists ? doc.data() : {};

  /***** ① 初回：セクション数登録 *****/
  if (user.status === 'WAIT_COUNT') {
    if (/^\d+$/.test(text)) {
      await ref.set({ dailyTarget: Number(text), status: 'READY' }, { merge: true });
      return reply(event, `アーニャ　了解！　一日　${text}せくしょん、一緒にがんばるます！`);
    }
    return reply(event, 'はげちゃびん　数字で　教えろ');
  }

  /***** ② 通常運用（READY 時） *****/
  if (user.status === 'READY') {
    if (text === '休養日') {
      await ref.set({ [`rest.${dateKey()}`]: true }, { merge: true });
      return reply(event, '遠慮するな　今日はゆっくり休め。アーニャも　あしたから　本気出す');
    }
    if (/^\d+$/.test(text)) {
      const num = Number(text);
    
      // 🔴 範囲外チェック
      if (num < 1 || num > 50) {
        return reply(event, 'ないすうじ　言うな！　アーニャ　騙されない！');
      }
    
      // 🟢 正常な自然数なら続行
      const today = dateKey();
      const ref = db.collection('users').doc(uid);
    
      const snap = await ref.get();
      const data = snap.data() || {};
    
      const currentArr =
        (data.report && data.report[today]) ? [...data.report[today]] : [];
    
      currentArr.push(num);
    
      await ref.set({
        report: {
          [today]: currentArr
        }
      }, { merge: true });
    
      const target = data.dailyTarget || 3;
      const len = currentArr.length;
    
      if (len < target) {
        return reply(event, `報告あざざます　続きも　頑張るます！（${len}/${target}）`);
      } else if (len === target) {
        return reply(event, 'てっぺきミッション だいせいこう！　アーニャ　嬉しい！　明日も　頑張るます！');
      } else {
        return reply(event, 'たくさんやって　すごい！　アーニャ　びっくり！');
      }
    } else if (/\d/.test(text)) {
      // 🟥 「数字が含まれてるけど自然数単体じゃない」パターン
      return reply(event, 'しぜんすうたんたいで　報告しろ　アーニャ　反応してやらない');
    }

}
}

/**********************
 *  返信ヘルパ
 **********************/
function reply(event, text) {
  return client.replyMessage(event.replyToken, { type: 'text', text });
}

/**********************
 *  remind.js の統合
 **********************/
const remindApp = require('./remind');
app.use(remindApp);

/**********************
 *  ローカル確認用サーバ
 **********************/
app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});