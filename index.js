const {WebClient} = require('@slack/client');
const {CronJob} = require('cron');
const promisify = require('es6-promisify');

const searchClient = new WebClient(process.env.SLACK_TOKEN || '');
const postClient = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN || '');

const sentMessages = {};
const EXPIRE_MSEC = 60 * 60 * 1000;
const run = async (isDry) => {
  try {
    // sentMessages からexpiredを取り除く
    for (const shortPermalink in sentMessages) {
      if (sentMessages[shortPermalink] < Date.now()) {
        delete sentMessages[shortPermalink];
      }
    }

    const result = await promisify(searchClient.search.messages, searchClient.search)('has:reaction', {count: 30});
    if (!result.ok) {
      return;
    }

    for (const message of result.messages.matches) {
      // 公開チャンネル以外は処理しない
      if (!/^C/.test(message.channel.id)) {
        continue;
      }

      const shortPermalink = message.permalink.replace(/^.+\/([^/]+\/[^/]+)$/, '$1');

      if (!sentMessages[shortPermalink] && !isDry) {
        const reactions = await promisify(postClient.reactions.get, postClient.reactions)({
          channel  : message.channel.id,
          timestamp: message.ts
        });
        const text = `誰かが <${message.permalink}|${shortPermalink}> を` + reactions.message.reactions.map(r => `:${r.name}:`).join(' ');
        await promisify(postClient.chat.postMessage, postClient.chat)(process.env.SLACK_CHANNEL_ID, text, {
          as_user     : false,
          icon_emoji  : ':star:',
          unfurl_links: true,
          username    : 'starbot2'
        });
      }
      sentMessages[shortPermalink] = Date.now() + EXPIRE_MSEC;
    }

    console.log(`There are ${Object.keys(sentMessages).length} message caches.`);
  } catch (e) {
    console.error(e);
  }
};

run(true);
new CronJob('00 * * * * *', () => run(false), null, true, 'Asia/Tokyo');
