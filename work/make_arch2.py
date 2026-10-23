from PIL import Image, ImageDraw, ImageFont
F="/System/Library/Fonts/Hiragino Sans GB.ttc"
def f(s,b=False): return ImageFont.truetype(F,s,index=1 if b else 0)
NAVY=(31,56,100); BLUE=(46,84,150); GREY=(85,90,100); WHITE=(255,255,255)
W,H=1500,980
img=Image.new("RGB",(W,H),WHITE); d=ImageDraw.Draw(img)
d.text((40,30),"房地产投资分析系统 — 逻辑架构",font=f(44,True),fill=NAVY)
d.text((40,86),"一次输入，统一账本；所有指标从同一套日期化现金流推导",font=f(22),fill=GREY)

def band(y,h,label,color=(46,84,150)):
    d.rounded_rectangle((35,y,1465,y+h),radius=16,fill=color)
    d.text((55,y+12),label,font=f(22,True),fill=WHITE)

def box(x,y,w,h,t,b,fill=WHITE,ts=26,bs=19):
    d.rounded_rectangle((x,y,x+w,y+h),radius=12,fill=fill,outline=BLUE,width=2)
    tw=d.textlength(t,font=f(ts,True))
    d.text((x+(w-tw)/2,y+14),t,font=f(ts,True),fill=NAVY)
    if b:
        for i,line in enumerate(b.split("\n")):
            bw=d.textlength(line,font=f(bs))
            d.text((x+(w-bw)/2,y+52+i*(bs+6)),line,font=f(bs),fill=GREY)

# band 1
band(112,145,"① 入口  INPUT")
box(70,150,410,90,"Simple Mode","3 个 Part · 60 秒出结果")
box(545,150,410,90,"Advanced Mode","10 个部分 · 完整台账")
box(1020,150,410,90,"导入 / 单据","Excel · SPA · 银行信")

# arrows
for x in (275,750,1225):
    d.line((x,257,x,292),fill=(120,135,160),width=4)
    d.polygon([(x-8,292),(x+8,292),(x,302)],fill=(120,135,160))

# band 2
band(300,175,"② 领域服务  DOMAIN SERVICES")
labels=[("购买结算","SPA vs 实价\n定金 / Cashback"),("贷款","摊销 / 利率变更\n赎回 / 罚金"),("租金","多单位 / 租约\n空置 / 押金"),("成本","法定费用 / 付款\n谁付 / 单据"),("出售","净售价 / RPGT\nretention")]
for i,(t,b) in enumerate(labels):
    box(55+i*285,340,265,100,t,b,ts=24,bs=17)

# arrows
for x in (275,750,1225):
    d.line((x,475,x,510),fill=(120,135,160),width=4)
    d.polygon([(x-8,510),(x+8,510),(x,523)],fill=(120,135,160))

# band 3
band(520,160,"③ 计算内核  ENGINE & LEDGER",(31,56,100))
box(60,560,430,90,"事件账本","日期 / 方向 / 金额 / 付款人")
box(535,560,430,90,"规则引擎","法定费率 / 版本 / 覆盖")
box(1010,560,430,90,"情景","Base / Optimistic / Conservative")

for x in (275,750,1225):
    d.line((x,680,x,715),fill=(120,135,160),width=4)
    d.polygon([(x-8,715),(x+8,715),(x,728)],fill=(120,135,160))

# band 4
band(730,160,"④ 输出  OUTPUT")
box(60,770,430,90,"指标 + 下钻","ROI / XIRR / 现金流")
box(535,770,430,90,"持有预测","1–5 年 / 逐年利润")
box(1010,770,430,90,"报告 / 组合","PDF / Excel / 20+ 项目")

# bottom
d.rounded_rectangle((35,915,1465,965),radius=12,fill=(234,240,250),outline=(200,210,225),width=2)
d.text((55,928),"横切：权限 · 审计日志 · 附件版本 · 中/英/马来语 · 金额 Decimal · 软删除",font=f(20),fill=NAVY)
img.save("work/diagrams/architecture.png")
print("ok")
