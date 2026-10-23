from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
def f(size, bold=False):
    # same family; use index 1 for bold-ish if available
    return ImageFont.truetype(FONT, size, index=1 if bold else 0)

NAVY=(31,56,100); BLUE=(46,84,150); LIGHT=(234,240,250); GREY=(90,95,105)
WHITE=(255,255,255); GREEN=(22,120,90); ORANGE=(196,110,30); RED=(160,50,50)

def wrap(draw, text, font, maxw):
    lines=[]; cur=""
    for ch in text:
        if ch=="\n":
            lines.append(cur); cur=""; continue
        t=cur+ch
        if draw.textlength(t, font=font) <= maxw:
            cur=t
        else:
            lines.append(cur); cur=ch
    if cur: lines.append(cur)
    return lines

def box(draw, xy, title, body="", fill=WHITE, outline=BLUE, tcol=NAVY, bcol=GREY,
        title_size=26, body_size=20, radius=14, pad=18, align="center"):
    x0,y0,x1,y1=xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=3)
    cx=(x0+x1)/2; y=y0+pad
    tf=f(title_size, True)
    lines=wrap(draw, title, tf, x1-x0-2*pad)
    for ln in lines:
        w=draw.textlength(ln, font=tf)
        draw.text((cx-w/2, y), ln, font=tf, fill=tcol)
        y += title_size+8
    if body:
        bf=f(body_size)
        lines=wrap(draw, body, bf, x1-x0-2*pad)
        for ln in lines:
            w=draw.textlength(ln, font=bf)
            draw.text((cx-w/2, y+4), ln, font=bf, fill=bcol)
            y += body_size+7

def arrow(draw, x0,y0,x1,y1, color=BLUE, width=4, head=12):
    draw.line((x0,y0,x1,y1), fill=color, width=width)
    import math
    ang=math.atan2(y1-y0,x1-x0)
    for a in (ang+2.6, ang-2.6):
        draw.line((x1,y1,x1+head*math.cos(a), y1+head*math.sin(a)), fill=color, width=width)

# ---------------- architecture ----------------
W,H=1800,1150
img=Image.new("RGB",(W,H),(248,249,252)); d=ImageDraw.Draw(img)
d.text((60,40), "房地产投资分析系统 — 逻辑架构", font=f(44,True), fill=NAVY)
d.text((60,100), "输入一次，账本统一，所有回报指标从同一套日期化现金流推导", font=f(24), fill=GREY)

def band(y, label, color):
    d.rounded_rectangle((50,y,1750,y+180), radius=18, fill=color, outline=None)
    d.text((70,y+16), label, font=f(24,True), fill=WHITE if color!=LIGHT else NAVY)

band(150,"① 入口层 INPUT", (46,84,150))
xs=[80,500,920,1340]
box(d,(xs[0],190,xs[0]+380,310),"Simple Mode","3 个 Part\n60 秒出结果",fill=WHITE)
box(d,(xs[1],190,xs[1]+380,310),"Advanced Mode","10 大部分 / 完整台账",fill=WHITE)
box(d,(xs[2],190,xs[2]+380,310),"Excel / CSV 导入","4 个旧模板迁移",fill=WHITE)
box(d,(xs[3],190,xs[3]+330,310),"文件与单据","SPA / 贷款 / 律师单",fill=WHITE)

band(360,"② 领域服务 DOMAIN SERVICES", (36,84,140))
labels=[("购买与结算","SPA vs 实价 / 定金 / Cashback"),("贷款与摊销","等额本息 / 利率变更 / 赎回"),("租金与租约","多单位 / 空置 / 押金"),("成本与付款","法定费用 / 谁付 / 票据"),("出售与 RPGT","净售价 / 保留款 / 1–5 年预测")]
for i,(t,b) in enumerate(labels):
    x=80+i*340
    box(d,(x,400,x+310,545),t,b,fill=WHITE,title_size=24,body_size=18)

band(575,"③ 计算内核 ENGINE & LEDGER", (31,56,100))
box(d,(80,615,600,760),"事件账本 EVENT LEDGER","每笔钱：日期 / 方向 / 账户\n付款人 / 收款人 / 单据",fill=WHITE,title_size=25,body_size=18)
box(d,(640,615,1160,760),"规则引擎 RULE ENGINE","法定费率 / 生效日期 / 版本\n自动估算 + 实际覆盖",fill=WHITE,title_size=25,body_size=18)
box(d,(1200,615,1720,760),"情景覆盖 SCENARIO","Base / Optimistic / Conservative\n不改历史，只叠假设",fill=WHITE,title_size=25,body_size=18)

band(790,"④ 输出层 OUTPUT", (46,84,150))
outs=[("指标与下钻","ROI / IRR / 现金流"),("持有预测","1–5 年 / 逐年利润"),("报告","PDF / Excel"),("组合看板","20+ 项目汇总")]
for i,(t,b) in enumerate(outs):
    x=80+i*420
    box(d,(x,830,x+390,960),t,b,fill=WHITE,title_size=24,body_size=18)

# side rail
d.rounded_rectangle((80,990,1720,1100), radius=16, fill=(232,238,248), outline=(200,210,225), width=2)
d.text((105,1008), "横切能力：权限与多租户  ·  审计日志  ·  附件与版本  ·  中/英/马来语  ·  金额用 Decimal  ·  软删除", font=f(21), fill=NAVY)
img.save("work/diagrams/architecture.png")
print("arch ok")

# ---------------- ERD ----------------
W,H=1800,1250
img=Image.new("RGB",(W,H),(248,249,252)); d=ImageDraw.Draw(img)
d.text((60,40), "核心数据模型（简化 ERD）", font=f(44,True), fill=NAVY)
d.text((60,100), "Property 是资产；Deal 是一次交易；所有金额最终落到 Ledger / Payment", font=f(23), fill=GREY)

def ent(x,y,w,h,name,fields,color=BLUE):
    d.rounded_rectangle((x,y,x+w,y+h), radius=12, fill=WHITE, outline=color, width=3)
    d.rectangle((x,y,x+w,y+42), fill=color)
    d.text((x+14,y+8), name, font=f(24,True), fill=WHITE)
    yy=y+54
    for line in fields:
        d.text((x+14,yy), line, font=f(18), fill=GREY)
        yy+=28

ent(60,160,330,220,"Property 资产",["id / 名称 / 地址","类型 / 面积 / 产权","剩余租期 / 状态"])
ent(60,430,330,250,"Deal 交易",["Property / 策略","购买日 / 持有期","状态：持有/已售"])
ent(60,730,330,190,"Sale 出售",["预计/实际售价","出售日 / 费用","RPGT / 赎回"])

ent(470,160,360,250,"Loan 贷款",["银行 / 批准额 / 发放额","利率 / 年限 / 锁定期","还款方式 / 起始日"])
ent(470,460,360,190,"RatePeriod 利率段",["生效日 / 利率","SBR + spread","变更原因"])
ent(470,700,360,220,"CostItem 成本项",["类别 / 金额","Est/Actual","资本化 / 费用化"])

ent(910,160,360,220,"Unit 单位",["楼层 / 面积","租金 / 状态"])
ent(910,430,360,250,"Tenancy 租约",["起止 / 租金 / 押金","免租 / 递增 / 空置"])
ent(910,730,360,190,"HoldingCost 持有费",["税 / 保险 / 维修","月/年/一次性"])

ent(1350,160,390,220,"Projection 持有预测",["持有年限 1–5","租金 / 空置 / 增长","RPGT 30/20/15/0"])
ent(1350,430,390,250,"Payment 付款记录",["日期 / 付款人 / 收款人","类别 / 方式 / 收据"])
ent(1350,730,390,190,"Document 附件",["类型 / URL / 哈希","上传人 / 时间"])

ent(470,970,360,170,"Scenario 情景",["假设集 / 版本","Base / Opt / Cons"])
ent(910,970,360,170,"LedgerEntry 账本",["日期 / 方向 / 金额","账户 / 类别 / 单据"])
ent(1350,970,390,170,"KPI 指标快照",["输入哈希 / 引擎版本","结果可复现"])

# connectors (simple)
def link(x0,y0,x1,y1,label=""):
    d.line((x0,y0,x1,y1), fill=(150,160,175), width=3)
    if label:
        d.text(((x0+x1)/2-30,(y0+y1)/2-24), label, font=f(16), fill=(120,125,135))
link(390,270,470,270,"1:N")
link(390,520,470,520,"")
link(390,800,470,800,"")
link(650,410,650,460,"")
link(650,650,650,700,"")
link(830,270,910,270,"1:N")
link(830,520,910,520,"")
link(830,800,910,800,"")
link(1270,270,1350,270,"")
link(1270,520,1350,520,"")
link(1270,800,1350,800,"")
link(650,920,890,970,"")
link(1030,920,1070,970,"")
link(1510,650,1510,730,"")

img.save("work/diagrams/erd.png")
print("erd ok")
