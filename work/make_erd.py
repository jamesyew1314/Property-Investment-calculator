from PIL import Image, ImageDraw, ImageFont
FONT="/System/Library/Fonts/Hiragino Sans GB.ttc"
def f(s,b=False): return ImageFont.truetype(FONT,s,index=1 if b else 0)
NAVY=(31,56,100); BLUE=(46,84,150); GREY=(88,94,104); WHITE=(255,255,255)
W,H=1800,1050
img=Image.new("RGB",(W,H),(248,249,252)); d=ImageDraw.Draw(img)
d.text((60,36),"核心数据模型（简化 ERD）",font=f(44,True),fill=NAVY)
d.text((60,96),"Property 是资产；Deal 是一次交易；所有金额最终落到 Ledger / Payment",font=f(23),fill=GREY)

def ent(x,y,w,name,fields,color=BLUE,h=150):
    d.rounded_rectangle((x,y,x+w,y+h),radius=12,fill=WHITE,outline=color,width=3)
    d.rectangle((x,y,x+w,y+40),fill=color)
    d.text((x+13,y+7),name,font=f(23,True),fill=WHITE)
    yy=y+50
    for line in fields:
        d.text((x+13,yy),line,font=f(17),fill=GREY); yy+=27

def link(x0,y0,x1,y1,dash=False,label=""):
    if dash:
        # dashed line
        import math
        L=math.hypot(x1-x0,y1-y0); n=max(int(L//12),1)
        for i in range(n):
            if i%2: continue
            xa=x0+(x1-x0)*i/n; ya=y0+(y1-y0)*i/n
            xb=x0+(x1-x0)*(i+1)/n; yb=y0+(y1-y0)*(i+1)/n
            d.line((xa,ya,xb,yb),fill=(150,160,175),width=3)
    else:
        d.line((x0,y0,x1,y1),fill=(150,160,175),width=3)
    if label: d.text(((x0+x1)/2-10,(y0+y1)/2-22),label,font=f(15),fill=(120,125,135))

x1,x2,x3,x4=60,470,910,1350
w1,w2,w3,w4=330,360,360,390
y1,y2,y3,y4=150,370,590,810

ent(x1,y1,w1,"Property 资产",["id / 名称 / 地址","类型 / 面积 / 产权","剩余租期 / 状态"])
ent(x1,y2,w1,"Deal 交易",["Property / 策略","购买日 / 持有期","状态：持有 / 已售"])
ent(x1,y3,w1,"Sale 出售",["预计 / 实际售价","出售日 / 费用","RPGT / 赎回"])

ent(x2,y1,w2,"Loan 贷款",["银行 / 批准额 / 发放额","利率 / 年限 / 锁定期","还款方式 / 起始日"])
ent(x2,y2,w2,"RatePeriod 利率段",["生效日 / 利率","SBR + spread","变更原因"])
ent(x2,y3,w2,"CostItem 成本项",["类别 / 金额","Est / Actual","资本化 / 费用化"])

ent(x3,y1,w3,"Unit 单位",["楼层 / 面积","租金 / 状态","可独立出租"])
ent(x3,y2,w3,"Tenancy 租约",["起止 / 租金 / 押金","免租 / 递增 / 空置","租客 / 账单日"])
ent(x3,y3,w3,"HoldingCost 持有费",["税 / 保险 / 维修","月 / 年 / 一次性","业主 / 租客承担"])

ent(x4,y1,w4,"Investor 投资人",["姓名 / 出资%","分润% / 门槛","联系方式"])
ent(x4,y2,w4,"CapitalTxn 资本流水",["出资 / 垫付 / 退回","日期 / 账户 / 单据","性质：股权 / 借款"])
ent(x4,y3,w4,"Distribution 分配",["日期 / 金额","本金 / 利润","审批人"])

ent(x1,y4,740,"Ledger 事件账本",["每一笔现金：日期 / 方向 / 金额 / 账户 / 付款人 / 收款人 / 单据","所有报表从账本推导；已过账不可改，只能冲销"],h=160,color=(31,56,100))
ent(x3,y4,w3,"Scenario 情景",["假设集 / 版本","Base / Optimistic / Conservative"],h=160)
ent(x4,y4,w4,"Document 附件",["类型 / URL / SHA-256","上传人 / 时间 / 版本"],h=160)

# vertical chain within columns
link(x1+w1/2,y1+150,x1+w1/2,y2,label="1:N")
link(x1+w1/2,y2+150,x1+w1/2,y3,label="1:1")
link(x2+w2/2,y1+150,x2+w2/2,y2,label="1:N")
link(x2+w2/2,y2+150,x2+w2/2,y3,label="1:N")
link(x3+w3/2,y1+150,x3+w3/2,y2,label="1:N")
link(x3+w3/2,y2+150,x3+w3/2,y3,label="")
link(x4+w4/2,y1+150,x4+w4/2,y2,label="1:N")
link(x4+w4/2,y2+150,x4+w4/2,y3,label="1:N")

# horizontal
link(x1+w1,y1+75,x2,y1+75,label="1:N")
link(x1+w1,y2+75,x2,y2+75,label="1:N")
link(x2+w2,y1+75,x3,y1+75,label="")
link(x2+w2,y3+75,x3,y3+75,label="")
link(x3+w3,y1+75,x4,y1+75,label="")
link(x3+w3,y2+75,x4,y2+75,label="")

# to ledger (dashed)
for (x,y,w) in [(x1,y3,w1),(x2,y3,w2),(x3,y3,w3),(x4,y3,w4)]:
    link(x+w/2,y+150,x+w/2 if x!=x4 else x+w/2,y4,dash=True)
img.save("work/diagrams/erd.png")
print("ok")
