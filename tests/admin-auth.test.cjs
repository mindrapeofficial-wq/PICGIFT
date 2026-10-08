const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.value = '';
    this.textContent = '';
    this.required = tag === 'input';
    this.disabled = false;
    this.hidden = false;
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      toggle: (value, forced) => {
        if (forced === undefined) forced = !classes.has(value);
        forced ? classes.add(value) : classes.delete(value);
        return forced;
      },
      contains: value => classes.has(value)
    };
    this.label = { classList: this.classList };
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this[name] = value; }
  closest(selector) { return selector === 'label' ? this.label : null; }
  focus() { this.focused = true; }
}

function fixture() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  return { elements, get, document: { getElementById: get, createElement: tag => new Element(tag) } };
}
function runModule(path, context) {
  const source = fs.readFileSync(path, 'utf8').replace(/^import .*;\s*$/gm, '');
  return vm.runInNewContext('(async () => {\n' + source + '\n})()', context, { filename: path });
}

test('Google account with verified email can request a new PICGIFT password', async () => {
  const { get, document } = fixture();
  const sent = [];
  const users = [
    { id: 'oauth-user', email: 'oauth@example.test', confirmed: true, providers: ['google'], used_today: 0, daily_limit: 3, premium_daily_limit: null, enabled: true },
    { id: 'unverified-user', email: 'unverified@example.test', confirmed: false, providers: ['email'], used_today: 0, daily_limit: 3, premium_daily_limit: null, enabled: false }
  ];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test' } } }),
      resetPasswordForEmail: async (...args) => { sent.push(args); return { error: null }; }
    },
    functions: {
      invoke: async (_name, { body }) => ({ data: body.action === 'health'
        ? { admin: true }
        : { admin: true, users, utc_day: '2026-10-09', settings: { global_daily_limit: 48, default_user_daily_limit: 3 }, premium_settings: { daily_limit: 3 }, global_used: 0 } })
    }
  };
  const context = {
    document, location: { origin: 'https://picgift.onrender.com' },
    window: { confirm: () => true },
    createClient: () => client
  };
  await runModule('admin.js', context);
  const cards = get('user-list').children;
  assert.equal(cards.length, 2);
  const google = cards.find(card => card.children[0].children[0].textContent === 'oauth@example.test');
  const unverified = cards.find(card => card.children[0].children[0].textContent === 'unverified@example.test');
  const googleReset = google.children.at(-1).children.at(-1);
  const unverifiedReset = unverified.children.at(-1).children.at(-1);
  assert.equal(googleReset.disabled, false, 'Google-only account must not be disabled');
  assert.match(googleReset.textContent, /Crear o restablecer contraseña/);
  assert.equal(unverifiedReset.disabled, true, 'Unconfirmed addresses must not be enabled');
  await googleReset.listeners.click();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 'oauth@example.test');
  assert.equal(sent[0][1].redirectTo, 'https://picgift.onrender.com/');
  assert.equal(googleReset.disabled, false);
  assert.equal(googleReset.textContent, 'Crear o restablecer contraseña');
});

test('recovery link opens usable form and saves new password without hidden email blocking submission', async () => {
  const { get, document } = fixture();
  get('auth-email').required = true;
  get('auth-password').value = 'strong-password-123';
  let listener, resolveInitial, saves = [], authEvents = [];
  let getCalls = 0;
  const account = { id: 'account-1', email: 'oauth@example.test' };
  const client = {
    auth: {
      onAuthStateChange: callback => { listener = callback; },
      getUser: () => ++getCalls === 1
        ? new Promise(resolve => { resolveInitial = resolve; })
        : Promise.resolve({ data: { user: account }, error: null }),
      updateUser: async values => { saves.push(values); return { error: null }; }
    }
  };
  const context = {
    document, createClient: () => client,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_012345678901234567890123456789',
    location: { origin: 'https://picgift.onrender.com', pathname: '/' },
    window: { dispatchEvent: event => authEvents.push(event), picgiftAuthMode: 'login' },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  };
  await runModule('auth.js', context);
  listener('PASSWORD_RECOVERY', { user: account });
  assert.equal(get('auth').classList.contains('show'), true);
  assert.equal(get('auth-email').required, false);
  assert.equal(get('auth-password').focused, true);
  resolveInitial({ data: { user: account }, error: null });
  await Promise.resolve();
  assert.equal(authEvents.length, 0, 'No account event should close the recovery form');
  await get('auth-form').listeners.submit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(JSON.stringify(saves)), [{ password: 'strong-password-123' }]);
  assert.equal(get('auth-email').required, true);
  assert.equal(get('auth').classList.contains('show'), false);
  assert.equal(get('auth-submit').textContent, 'Entrar en mi cuenta');
});
