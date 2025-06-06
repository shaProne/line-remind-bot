const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);
const app = express();

// Webhookを受け取るエンドポイント
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(async (event) => {
    // ユーザーからのメッセージを受け取ったときだけ処理
    if (event.type === 'message' && event.message.type === 'text') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `「${event.message.text}」了解です！`
      });
    }
  }))
  .then(() => res.status(200).send('OK'));
});

// ローカル動作用（後でVercelに置き換え）
app.listen(3000, () => {
  console.log('Server is running at http://localhost:3000');
});