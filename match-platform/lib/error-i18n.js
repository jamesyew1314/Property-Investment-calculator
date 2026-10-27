// 服务端错误文案的英文映射：浏览器用 Accept-Language 选择语言。
// 所有用户可见的 API 错误都必须在这里有英文；新增中文提示时同步补一条。

const EN = new Map([
  ['请先登录', 'Please sign in'],
  ['没有权限', 'You do not have permission'],
  ['找不到记录', 'Not found'],
  ['尝试过于频繁，请稍后再试', 'Too many attempts. Please try again later.'],
  ['登录尝试过多，请 10 分钟后再试', 'Too many login attempts. Try again in 10 minutes.'],
  ['请求内容过大', 'Request body is too large'],
  ['请求内容不是有效 JSON', 'Request body is not valid JSON'],
  ['来源不合法', 'Invalid request origin'],
  ['来源与站点不一致', 'Request origin does not match the site'],
  ['缺少 area/type/intent', 'Missing area/type/intent'],
  ['只有演示账号可以重置演示数据', 'Only the demo account can reset demo data'],
  ['接口不存在', 'Endpoint not found'],
  ['服务器内部错误', 'Internal server error'],

  ['请填写姓名（至少 2 个字）', 'Enter a name (at least 2 characters)'],
  ['邮箱格式不正确', 'Invalid email address'],
  ['密码至少 8 位', 'Password must be at least 8 characters'],
  ['联络电邮格式不正确', 'Invalid contact email'],
  ['请检查注册资料', 'Check your registration details'],
  ['这个邮箱已注册', 'This email is already registered'],
  ['邮箱已注册', 'Email already registered'],
  ['邮箱或密码不正确', 'Incorrect email or password'],
  ['姓名太短', 'Name is too short'],
  ['请填写姓名', 'Enter your name'],
  ['当前密码不正确', 'Current password is incorrect'],
  ['密码不正确', 'Password is incorrect'],
  ['新密码至少 8 位', 'New password must be at least 8 characters'],

  ['数值不正确', 'Invalid number'],
  ['选项无效', 'Invalid option'],
  ['日期格式应为 YYYY-MM-DD', 'Date must be YYYY-MM-DD'],
  ['请选择出售或出租', 'Choose sale or rent'],
  ['请填写房源名称', 'Enter a listing title'],
  ['请选择房型', 'Choose a property type'],
  ['请填写区域', 'Enter an area'],
  ['请填写价格', 'Enter a price'],
  ['请检查房源资料', 'Check the listing details'],
  ['请填写客户称呼', 'Enter the client name'],
  ['请选择买或租', 'Choose buy or rent'],
  ['请填写预算上限', 'Enter the maximum budget'],
  ['预算下限不能高于上限', 'Minimum budget cannot exceed maximum'],
  ['请检查客户需求', 'Check the client brief'],
  ['请选择跟进状态', 'Choose a follow-up status'],
  ['状态无效', 'Invalid status'],
  ['请检查表单', 'Check the form'],
  ['保存失败', 'Save failed']
]);

function dynamic(message) {
  let m = message.match(/^月租需在 (.+)–(.+)$/);
  if (m) return `Monthly rent must be between ${m[1]} and ${m[2]}`;
  m = message.match(/^售价需在 (.+)–(.+)$/);
  if (m) return `Price must be between ${m[1]} and ${m[2]}`;
  return null;
}

export function localizeError(error, lang = 'zh') {
  if (!error || lang !== 'en') return error;
  const message = String(error.message || '');
  const translated = EN.get(message) || dynamic(message) || message;
  const out = {...error, message: translated};
  if (error.fields && typeof error.fields === 'object') {
    out.fields = Object.fromEntries(
      Object.entries(error.fields).map(([key, value]) => [
        key,
        EN.get(String(value)) || dynamic(String(value)) || value
      ])
    );
  }
  return out;
}
