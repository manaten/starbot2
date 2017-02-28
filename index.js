const {WebClient} = require('@slack/client');
const {CronJob} = require('cron');
const promisify = require('es6-promisify');

const webClient = new WebClient(process.env.SLACK_TOKEN || '');

const sentMessages = [];
const EXPIRE_MSEC = 60 * 60 * 1000;
const run = async (isDry) => {
  try {
    // sentMessages からexpiredを取り除く
    for (const text in sentMessages) {
      if (sentMessages[text] < Date.now()) {
        delete sentMessages[text];
      }
    }

    const result = await promisify(webClient.search.all, webClient.search)('has:reaction', {count: 30});
    if (!result.ok) {
      return;
    }

    for (const message of result.messages.matches) {
      // 公開チャンネル以外は処理しない
      if (!/^C/.test(message.channel.id)) {
        continue;
      }

      const shortPermalink = message.permalink.replace(/^.+\/([^/]+\/[^/]+)$/, '$1');
      const text = `<${message.permalink}|${shortPermalink}> が reaction されたよ`;

      if (!sentMessages[text] && !isDry) {
        await promisify(webClient.chat.postMessage, webClient.chat)(process.env.SLACK_CHANNEL_ID, text, {
          as_user     : false,
          icon_emoji  : ':star:',
          unfurl_links: true,
          username    : 'starbot2'
        });
      }
      sentMessages[text] = Date.now() + EXPIRE_MSEC;
    }

    console.log(`There are ${Object.keys(sentMessages).length} message caches.`);
  } catch (e) {
    console.error(e);
  }
};

run(true);
new CronJob('00 * * * * *', () => run(false), null, true, 'Asia/Tokyo');
