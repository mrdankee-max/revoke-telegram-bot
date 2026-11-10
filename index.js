const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = new Set((process.env.ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
if (!TOKEN) throw new Error('BOT_TOKEN is required');

const bot = new Telegraf(TOKEN);
const app = express();
app.use(express.json());

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: {}, keys: [], referrals: {} }; }
}
let db = load();
function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function isAdmin(ctx) { return ADMIN_IDS.has(String(ctx.from.id)); }
function mainMenu(admin) {
  const rows = [
    [Markup.button.callback('Получить ключ', 'get_key'), Markup.button.callback('Мои ключи', 'my_keys')],
    [Markup.button.callback('Подписка', 'subscription'), Markup.button.callback('Рефералы', 'referrals')],
    [Markup.button.callback('Помощь', 'help')]
  ];
  if (admin) rows.push([Markup.button.callback('Создать ключ', 'admin_new'), Markup.button.callback('Статистика', 'admin_stats')]);
  return Markup.inlineKeyboard(rows);
}
function touchUser(ctx, refId) {
  const id = String(ctx.from.id);
  if (!db.users[id]) {
    db.users[id] = { id, name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '), username: ctx.from.username || '', joinedAt: new Date().toISOString() };
    if (refId && refId !== id && db.users[refId] && !db.referrals[id]) {
      db.referrals[id] = refId;
    }
  } else {
    db.users[id].name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');
    db.users[id].username = ctx.from.username || '';
  }
  save();
}
function makeKey(days = 30, gb = 100) {
  const key = 'RVK-' + crypto.randomBytes(4).toString('hex').toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  return { key, days, gb, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + days * 86400000).toISOString(), owner: null, status: 'unused' };
}
async function sendHome(ctx) {
  await ctx.reply('REVOKE VPN\nЛичный кабинет', mainMenu(isAdmin(ctx)));
}
bot.start((ctx) => {
  const payload = (ctx.startPayload || '').replace(/^ref_/, '');
  touchUser(ctx, payload);
  return sendHome(ctx);
});
bot.command('menu', async ctx => { touchUser(ctx); await sendHome(ctx); });
bot.command('newkey', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Команда доступна только администратору.');
  const days = Math.max(1, Math.min(3650, Number(ctx.message.text.split(/\s+/)[1]) || 30));
  const gb = Math.max(1, Math.min(100000, Number(ctx.message.text.split(/\s+/)[2]) || 100));
  const item = makeKey(days, gb); db.keys.push(item); save();
  return ctx.reply('Ключ создан:\n' + item.key + '\nСрок: ' + days + ' дн.\nЛимит: ' + gb + ' ГБ');
});
bot.command('stats', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Нет доступа.');
  return ctx.reply('Пользователей: ' + Object.keys(db.users).length + '\nКлючей: ' + db.keys.length + '\nАктивированных: ' + db.keys.filter(k => k.status === 'active').length);
});
bot.command('users', async ctx => {
  if (!isAdmin(ctx)) return ctx.reply('Нет доступа.');
  return ctx.reply('Всего пользователей: ' + Object.keys(db.users).length);
});
bot.action('get_key', async ctx => {
  await ctx.answerCbQuery();
  const item = db.keys.find(k => k.status === 'unused');
  if (!item) return ctx.reply('Свободных ключей пока нет. Попробуй позже.');
  item.status = 'active'; item.owner = String(ctx.from.id); item.activatedAt = new Date().toISOString(); save();
  return ctx.reply('Твой ключ:\n' + item.key + '\nСрок: ' + item.days + ' дн.\nЛимит: ' + item.gb + ' ГБ');
});
bot.action('my_keys', async ctx => {
  await ctx.answerCbQuery();
  const mine = db.keys.filter(k => k.owner === String(ctx.from.id));
  return ctx.reply(mine.length ? 'Твои ключи:\n' + mine.map(k => k.key + ' (' + k.status + ')').join('\n') : 'У тебя пока нет ключей.');
});
bot.action('subscription', async ctx => {
  await ctx.answerCbQuery();
  const mine = db.keys.filter(k => k.owner === String(ctx.from.id) && k.status === 'active');
  return ctx.reply(mine.length ? 'Активные подписки:\n' + mine.map(k => k.key + '\nДо: ' + new Date(k.expiresAt).toLocaleDateString('ru-RU') + '\nЛимит: ' + k.gb + ' ГБ').join('\n\n') : 'Активных подписок нет.');
});
bot.action('referrals', async ctx => {
  await ctx.answerCbQuery();
  const id = String(ctx.from.id);
  const count = Object.values(db.referrals).filter(x => x === id).length;
  const link = 'https://t.me/' + (bot.botInfo?.username || 'YOUR_BOT') + '?start=ref_' + id;
  return ctx.reply('Твоя реферальная ссылка:\n' + link + '\nПриглашено: ' + count);
});
bot.action('help', async ctx => { await ctx.answerCbQuery(); return ctx.reply('Поддержка: напиши администратору.'); });
bot.action('admin_new', async ctx => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Нет доступа.');
  const item = makeKey(); db.keys.push(item); save();
  return ctx.reply('Создан ключ:\n' + item.key + '\nСрок: 30 дн.\nЛимит: 100 ГБ');
});
bot.action('admin_stats', async ctx => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Нет доступа.');
  return ctx.reply('Пользователей: ' + Object.keys(db.users).length + '\nВсего ключей: ' + db.keys.length + '\nСвободных: ' + db.keys.filter(k => k.status === 'unused').length + '\nАктивных: ' + db.keys.filter(k => k.status === 'active').length);
});
bot.catch(err => console.error('Bot error:', err));

app.get('/health', (_req, res) => res.status(200).send('ok'));
const secret = process.env.WEBHOOK_SECRET || crypto.randomBytes(24).toString('hex');
const external = process.env.RENDER_EXTERNAL_URL;
if (external) {
  const webhookPath = '/telegram/' + secret;
  app.use(bot.webhookCallback(webhookPath));
  app.listen(PORT, async () => {
    await bot.telegram.setWebhook(external.replace(/\/$/, '') + webhookPath);
    console.log('Webhook server listening on', PORT);
  });
} else {
  bot.launch().then(() => console.log('Bot started with long polling'));
  app.listen(PORT, () => console.log('Health server listening on', PORT));
}
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
