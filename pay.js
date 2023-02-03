const db = require('dc-api-mongo').connect();
const { NodeSSH } = require('node-ssh');
const proxmox = require('proxmox-api');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function getNode(tariff_id) {
    const tariff = await db.Vtariff.findById(tariff_id).lean();
    if (!tariff) return false;

    const node = await db.Node.findById(tariff.node_id).lean();
    if (!node) return false;

    return node;
}

(async () => {
    const services = await db.Vserver.find().lean();

    for(let item of services) {
        const user = await db.User.findById(item.user_id).lean();
        const tariff = await db.Vtariff.findById(item.tariff_id).lean();

        const price = +(tariff.price / 30 / 24).toFixed(2);
        const new_balance = +(user.balance - price).toFixed(2);

        const node = await getNode(item.tariff_id);

        await db.User.updateOne({ _id: user._id }, { balance: new_balance });

        await db.Operation.create({
            user_id: user._id,
            description: `Виртуальный сервер №${item.numId} / Списание ${price} рублей`
        });

        if (new_balance < -user.credit_limit) {
            const ssh = new NodeSSH();
            await ssh.connect({
                host: node.hostname,
                username: node.username,
                password: node.password,
                port: 22
            });
    
            const api = proxmox.proxmoxApi({ host: node.hostname, username: node.username + '@pam', password: node.password });
            await api.nodes.$(node.name).lxc.$(item.ctid).$delete({ force: true, 'destroy-unreferenced-disks': true });
            await db.Vserver.deleteOne({ _id: item._id });
        }
    }

    process.exit(0);
})();