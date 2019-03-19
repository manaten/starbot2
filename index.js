const { WebClient } = require('@slack/client');
const { CronJob } = require('cron');
const { uniqBy } = require('lodash');

const searchClient = new WebClient(process.env.SLACK_TOKEN || '');
const postClient = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN || '');

const getUserName = async userId => {
  if (!userId) {
    return null;
  }
  const result = await postClient.users.info({ user: userId });
  if  (!result.ok) {
    return null;
  }
  return result.user.name.replace(/^(.)/, '$1_');
};

const getReaction = async (channel, timestamp) => {
  const result = await postClient.reactions.get({ channel, timestamp });
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
    await postClient.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID,
      text,
      as_user     : false,
      icon_emoji  : ':star:',
      unfurl_links: true,
      username    : 'starbot2'
    });
  } catch (e) {
    console.error(e);
  }
};


const EXPIRE_MSEC = 7 * 24 * 60 * 60 * 1000;
const sentMessages = {};
const run = async isDry => {
  try {
    // sentMessages からexpiredを取り除く
    for (const permalink in sentMessages) {
      if (sentMessages[permalink] < Date.now()) {
        delete sentMessages[permalink];
      }
    }
    const result = await searchClient.search.messages({ query: 'has:reaction', count: 30 });

    if (!result.ok) {
      return;
    }

    const messages =
      uniqBy(result.messages.matches, m => m.permalink)
      .filter(m => !sentMessages[m.permalink]);
    console.log(
      `Got ${result.messages.matches.length} messages and ${messages.length} valid messages.` +
      (messages.length > 0 ? ` first message is ${messages[0].permalink})` : '')
    );

    for (const message of messages) {
      sentMessages[message.permalink] = Date.now() + EXPIRE_MSEC;
    }
    console.log(`There are ${Object.keys(sentMessages).length} message caches.`);

    if (!isDry) {
      for (const message of messages) {
        await processMessage(message);
      }
    }
    console.log('done.');
  } catch (e) {
    console.error(e);
  }
};

run(true);
new CronJob('00 * * * * *', () => run(false), null, true, 'Asia/Tokyo');
