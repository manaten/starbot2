const {WebClient} = require('@slack/client');
const {CronJob} = require('cron');
const promisify = require('es6-promisify');

const searchClient = new WebClient(process.env.SLACK_TOKEN || '');
const postClient = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN || '');

const getUserName = async userId => {
  if (!userId) {
    return null;
  }
  const result = await promisify(postClient.users.info, postClient.users)(userId);
  if  (!result.ok) {
    return null;
  }
  return result.user.name.replace(/^(.)/, '$1_');
};

const getReaction = async (channel, timestamp) => {
  const result = await promisify(postClient.reactions.get, postClient.reactions)({channel, timestamp});
  if (!result.ok || !result.message.reactions[0]) {
    return null;
  }
  return result.message.reactions[0];
};

const processMessage = async message => {
  try {
    // 公開チャンネル以外は処理しない
    if (!/^C/.test(message.channel.id)) {
      return;
    }
    const reaction = await getReaction(message.channel.id, message.ts);
    if (!reaction) {
      return;
    }
    const userName = (await getUserName(reaction.users[0])) || '誰か';
    const shortPermalink = message.permalink
      .replace(/^.+\/([^/]+\/[^/]+)$/, '$1')
      .replace(message.channel.id, message.channel.name);

    const text = `:${userName}: が <${message.permalink}|${shortPermalink}> を :${reaction.name}:`;
    await promisify(postClient.chat.postMessage, postClient.chat)(process.env.SLACK_CHANNEL_ID, text, {
      as_user     : false,
      icon_emoji  : ':star:',
      unfurl_links: true,
      username    : 'starbot2'
    });
  } catch (e) {
    console.error(e);
  }
};


const EXPIRE_MSEC = 60 * 60 * 1000;
const sentMessages = {};
const run = async isDry => {
  try {
    // sentMessages からexpiredを取り除く
    for (const permalink in sentMessages) {
      if (sentMessages[permalink] < Date.now()) {
        delete sentMessages[permalink];
      }
    }
    const result = await promisify(searchClient.search.messages, searchClient.search)('has:reaction', {count: 30});
    if (!result.ok) {
      return;
    }
    for (const message of result.messages.matches) {
      if (!sentMessages[message.permalink] && !isDry) {
        await processMessage(message);
      }
      sentMessages[message.permalink] = Date.now() + EXPIRE_MSEC;
    }
    console.log(`There are ${Object.keys(sentMessages).length} message caches.`);
  } catch (e) {
    console.error(e);
  }
};

run(true);
new CronJob('00 * * * * *', () => run(false), null, true, 'Asia/Tokyo');
