
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// 确保测试数据目录存在
const testDataDir = path.join(__dirname, '../test-data');
if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir);
}

// 辅助函数：生成随机日期
function randomDate(start, end) {
    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return date.toISOString().split('T')[0];
}

// 辅助函数：生成随机金额
function randomAmount(min, max) {
    return (Math.random() * (max - min) + min).toFixed(2);
}

// 公司列表
const companies = [
    '深圳市科技技术有限公司', '北京咨询服务有限公司', '上海贸易公司', '杭州网络科技有限公司',
    '广州电子元件厂', '成都软件开发中心', '武汉物流配送部', '南京新媒体工作室',
    '西安数据处理中心', '苏州市精密仪器厂', '重庆火锅连锁店', '天津进出口贸易公司',
    '长沙文化传媒有限公司', '郑州机械制造厂', '青岛海洋生物科技公司'
];

// 代理人列表
const agents = [
    '张三', '李四', '王五', '赵六', '孙七', '周八', '吴九', '郑十'
];

// 数据容器
const bankData = [['交易日期', '摘要', '对方户名', '交易金额', '余额', '备注']];
const invoiceData = [['发票代码', '发票号码', '开票日期', '购买方名称', '销售方名称', '金额', '税额', '价税合计', '备注']];
const mappingData = [['付款人名称', '标准名称', '备注']];

// 生成映射关系 (Agent -> Company)
const agentMapping = {};
agents.forEach((agent, index) => {
    const company = companies[index % companies.length];
    agentMapping[agent] = company;
    mappingData.push([agent, company, '自动生成映射']);
});

let currentBalance = 500000.00;
const startDate = new Date('2024-01-01');
const endDate = new Date('2024-03-31');

// 生成 100 条数据
for (let i = 0; i < 100; i++) {
    let isIncome = Math.random() > 0.2; // 80% 收入（需要对账），20% 支出
    const amount = parseFloat(randomAmount(100, 50000));

    // 确保余额不为负数
    if (!isIncome && currentBalance < amount) {
        isIncome = true;
    }
    const date = randomDate(startDate, endDate);

    // 场景选择
    const scenario = Math.random();
    let bankName, invoiceName, bankAmount, invoiceAmount, remark;

    if (scenario < 0.6) {
        // 1. 完全匹配 (60%)
        const company = companies[Math.floor(Math.random() * companies.length)];
        bankName = company;
        invoiceName = company;
        bankAmount = amount;
        invoiceAmount = amount;
        remark = '货款';
    } else if (scenario < 0.7) {
        // 2. 容差匹配 (10%) - 差额 5 元以内
        const company = companies[Math.floor(Math.random() * companies.length)];
        bankName = company;
        invoiceName = company;
        const diff = (Math.random() * 4 + 0.1) * (Math.random() > 0.5 ? 1 : -1);
        bankAmount = amount; // 银行实际收到
        invoiceAmount = amount + diff; // 发票金额多一点或少一点
        remark = '含手续费差异';
    } else if (scenario < 0.8) {
        // 3. 代理人匹配 (10%)
        const agent = agents[Math.floor(Math.random() * agents.length)];
        bankName = agent;
        invoiceName = agentMapping[agent]; // 关联的公司
        bankAmount = amount;
        invoiceAmount = amount;
        remark = `由${agent}代付`;
    } else {
        // 4. 无匹配/单边账 (20%)
        if (Math.random() > 0.5) {
            // 只有流水
            bankName = companies[Math.floor(Math.random() * companies.length)];
            bankAmount = amount;
            invoiceName = null; // 不生成发票
            remark = '未开票';
        } else {
            // 只有发票
            invoiceName = companies[Math.floor(Math.random() * companies.length)];
            invoiceAmount = amount;
            bankName = null; // 不生成流水
            remark = '未到账';
        }
    }

    // 添加银行流水
    if (bankName) {
        currentBalance += isIncome ? bankAmount : -bankAmount;
        bankData.push([
            date,
            isIncome ? '货款收入' : '付款',
            bankName,
            isIncome ? bankAmount.toFixed(2) : `-${bankAmount.toFixed(2)}`,
            currentBalance.toFixed(2),
            remark
        ]);
    }

    // 添加发票数据 (只针对收入生成发票)
    if (invoiceName && isIncome) {
        const taxRate = 0.06;
        const tax = invoiceAmount / (1 + taxRate) * taxRate;
        const net = invoiceAmount - tax;

        invoiceData.push([
            Math.floor(Math.random() * 100000000000).toString(), // 代码
            Math.floor(Math.random() * 100000000).toString(),    // 号码
            date,
            '我的公司',
            invoiceName,
            net.toFixed(2),
            tax.toFixed(2),
            invoiceAmount.toFixed(2),
            remark
        ]);
    }
}

// 写入文件
const bankWs = XLSX.utils.aoa_to_sheet(bankData);
const bankWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(bankWb, bankWs, '银行流水');
XLSX.writeFile(bankWb, path.join(testDataDir, 'bank_transactions.xlsx'));

const invoiceWs = XLSX.utils.aoa_to_sheet(invoiceData);
const invoiceWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(invoiceWb, invoiceWs, '发票数据');
XLSX.writeFile(invoiceWb, path.join(testDataDir, 'invoices.xlsx'));

const mappingWs = XLSX.utils.aoa_to_sheet(mappingData);
const mappingWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(mappingWb, mappingWs, '付款人映射');
XLSX.writeFile(mappingWb, path.join(testDataDir, 'payer_mappings.xlsx'));

console.log('生成完成:');
console.log(`- 银行流水: ${bankData.length - 1} 条`);
console.log(`- 发票数据: ${invoiceData.length - 1} 条`);
console.log(`- 付款人映射: ${mappingData.length - 1} 条`);
