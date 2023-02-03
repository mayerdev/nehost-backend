const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();
const { NodeSSH } = require('node-ssh');
const proxmox = require('proxmox-api');
const { PASSWORD_REGEX } = require('../utils/Verify');
const { makePassword } = require('../utils/Generators');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const OS_LIST = [
    'local:vztmpl/centos-7-default_20190926_amd64.tar.xz',
    'local:vztmpl/debian-11-standard_11.3-0_amd64.tar.gz',
    'local:vztmpl/ubuntu-20.04-standard_20.04-1_amd64.tar.gz',
    'local:vztmpl/debian-10-standard_10.7-1_amd64.tar.gz',
    'local:vztmpl/rockylinux-8-default_20210929_amd64.tar.xz'
];

function getOsType(os) {
    if (/ubuntu/g.test(os)) return 'ubuntu';
    if (/centos/g.test(os)) return 'centos';
    if (/rockylinux/g.test(os)) return 'centos';
    if (/debian/g.test(os)) return 'debian';
}

const SSH_SETUP_SCRIPT = `
while ! ping -c 1 -n -w 1 10.0.0.1 &> /dev/null
do printf .
done

if [ -d /etc/apt ]
    then apt install -y openssh-server
elif [ -d /etc/dnf ]
    then dnf install -y openssh-server
elif [ -d /etc/yum ]
    then yum install -y openssh-server
fi

echo PermitRootLogin yes >> /etc/ssh/sshd_config
service sshd restart
`.trim().replace(/\r?\n\s*/g, '; ');

async function setupSSH (node, ctId) {
    const ssh = new NodeSSH();
    await ssh.connect({
        host: node.hostname,
        username: node.username,
        password: node.password,
        port: 22
    });

    await ssh.execCommand(`lxc-wait -s RUNNING ${ctId} && lxc-attach ${ctId} -- bash -c '${SSH_SETUP_SCRIPT}'`);
}

async function allocPort(ip, node, localPort) {
    const port = await db.Port.findOne({ subnet_id: ip.subnet_id, allocated: false });

    const ssh = new NodeSSH();
    await ssh.connect({
        host: node.hostname,
        username: node.username,
        password: node.password,
        port: 22
    });

    await ssh.execCommand(`./add-port.sh ${port.port} ${ip.ip}:${localPort} tcp`, { cwd: '/root' });

    await db.Port.updateOne({ _id: port._id }, { ip_id: ip._id, localPort, allocated: true });
    return {
        port_id: port._id,
        public_address: node.hostname + ':' + port.port
    };
}

async function unallocPort(port) {
    const ip = await db.Ip.findById(port.ip_id).lean();
    const subnet = await db.Subnet.findById(ip.subnet_id).lean();
    const node = await db.Node.findById(subnet.node_id).lean();

    const ssh = new NodeSSH();
    await ssh.connect({
        host: node.hostname,
        username: node.username,
        password: node.password,
        port: 22
    });

    await ssh.execCommand(`./del-port.sh ${port.port} ${ip.ip}:${port.localPort} tcp`, { cwd: '/root' });

    await db.Port.updateOne({ _id: port._id }, { $unset: { ip_id: 1, localPort: 1 }, allocated: false });
}

async function getLimits(user_id) {
    const vservers = await db.Vserver.find({ user_id }).lean();

    let limits = {
        vcpu: 0,
        ram: 0,
        disk: 0,
        sites: 0,
        ports: 0
    };

    for (let item of vservers) {
        const tariff = await db.Vtariff.findById(item.tariff_id).lean();
        const ip = await db.Ip.findOne({ ip: item.ip, vserver_id: item._id, reserved: true }).lean();
        const ports = await db.Port.find({ ip_id: ip._id, allocated: true }).countDocuments();

        if (tariff) {
            limits.vcpu += tariff.vcpu;
            limits.ram += tariff.ram;
            limits.disk += tariff.disk;
            limits.ports += ports;
        }
    }

    return limits;
}

async function canOrderVPS(user_id, limits, tariff) {
    const user = await db.User.findById(user_id).lean();
    if (!user) return false;

    if ((tariff.vcpu + limits.vcpu) > user.limits.vcpu) return false;
    if ((tariff.ram + limits.ram) > user.limits.ram) return false;
    if ((tariff.disk + limits.disk) > user.limits.disk) return false;

    return true;
}

async function getNode(tariff_id) {
    const tariff = await db.Vtariff.findById(tariff_id).lean();
    if (!tariff) return false;

    const node = await db.Node.findById(tariff.node_id).lean();
    if (!node) return false;

    return node;
}

const REQUEST_TYPES = ['vcpu', 'ram', 'disk', 'ports'];

module.exports = class Services extends HttpController {
    async onLoad() {
        if (!this.session.user) return this.drop();

        const user = await db.User.findById(this.session.user).lean();
        
        if(user && user.group === 'admin') {
            this.session.isAdmin = true;
            await this.session.save();
        } else {
            this.session.isAdmin = false;
            await this.session.save();

            if(!user.dogovor || !user.dogovor.accepted) return this.send('Вы не заключили договор', 403);
        }
    }

    async getLocations() {
        return await db.Location.find({ available: true }).select('_id name').lean();
    }

    async getNodes() {
        if (!this.data) return this.send('FillFields', 400);

        return await db.Node.find({ location_id: this.data, available: true }).select('_id visible_name').lean();
    }

    async limitIncrease() {
        if(!this.data) return this.send('FillFields', 400);
        if(!REQUEST_TYPES.includes(this.data)) return this.send('UnknownType', 400);

        const title = 'Запрос увеличения лимитов / ' + this.data;

        const exists = await db.Ticket.findOne({ user_id: this.session.user, title }).lean();
        if(exists) return this.send('Exists', 404);

        const ticket = await db.Ticket.create({ user_id: this.session.user, title });
        await db.Message.create({ ticket_id: ticket._id, title: 'Обращение принято', text: 'Прошу увеличить лимиты на ресурс ' + this.data });

        return 'Success';
    }

    async getTariffs() {
        if (!this.data) return this.send('FillFields', 400);

        return await db.Vtariff.find({ node_id: this.data, available: true }).select('-node_id').lean();
    }

    async limits() {
        return getLimits(this.session.user);
    }

    async vservers() {
        const payload = { user_id: this.session.user };
        if(this.session.isAdmin) delete payload.user_id;

        const vservers = await db.Vserver.find(payload).sort({ _id: -1 }).lean();

        if(this.session.isAdmin) {
            for(let item of vservers) {
                const user = await db.User.findById(item.user_id).lean();
                if(user) item['user'] = `${user.firstname} ${user.lastname} <${user.email}> : ${user.numId}`
                else continue;
            }
        }

        return vservers;
    }

    async vserver() {
        if(!this.data) return this.send('FillFields', 400);

        const payload = { _id: this.data, user_id: this.session.user };
        if(this.session.isAdmin) delete payload.user_id;

        const vserver = await db.Vserver.findOne(payload).lean();
        if(!vserver) return this.send('NoServer', 404);

        return vserver;
    }

    async allocPort() {
        if (!this.data || !this.data.vserver_id || !this.data.localPort) return this.send('FillFields', 400);

        if (this.data.localPort < 14 || this.data.localPort > 65535) return this.send('LocalPort', 400);

        const payload = { user_id: this.session.user, _id: this.data.vserver_id };
        if(this.session.isAdmin) delete payload.user_id;

        const vserver = await db.Vserver.findOne(payload).lean();
        if (!vserver) return this.send('NoServer', 404);

        const ip = await db.Ip.findOne({ ip: vserver.ip, vserver_id: vserver._id, reserved: true }).lean();
        if (!ip) return this.send('NoIp', 404);

        const node = await getNode(vserver.tariff_id);
        if (!node) return this.send('NoNode', 404);

        const limits = await getLimits(this.session.user);
        const user = await db.User.findById(this.session.user).lean();

        if((limits.ports + 1) > user.limits.ports) return this.send('Limits', 403);

        return await allocPort(ip, node, this.data.localPort);
    }

    async free() {
        if (!this.data) return this.send('FillFields', 400);

        const port = await db.Port.findById(this.data).lean();
        if (!port) return this.send('NoPort', 404);

        const ip = await db.Ip.findById(port.ip_id).lean();
        if (!ip) return this.send('NoIp', 404);

        if (!ip.vserver_id) return this.send('IncorrectIp', 500);

        const payload = { _id: ip.vserver_id, user_id: this.session.user };
        if(this.session.isAdmin) delete payload.user_id;

        const vserver = await db.Vserver.findOne(payload).lean();
        if (!vserver) return this.send('NoServer', 404);

        await unallocPort(port);

        return 'Success';
    }

    async ports() {
        let vservers;

        const payload = { _id: this.data, user_id: this.session.user };
        if(this.session.isAdmin) delete payload.user_id;

        if (this.data) vservers = [await db.Vserver.findOne(payload).lean()];
        else vservers = await db.Vserver.find({ user_id: this.session.user }).sort({ _id: -1 }).lean();

        let result = [];

        for (let item of vservers) {
            let ip = await db.Ip.findOne({ ip: item.ip, vserver_id: item._id, reserved: true }).lean();

            if (ip) {
                let ports = await db.Port.find({ ip_id: ip._id }).sort({ _id: -1 }).lean();

                for (let item of ports) {
                    if (item.ip_id) item['ip'] = await db.Ip.findById(item.ip_id).lean();

                    const subnet = await db.Subnet.findById({ _id: item.subnet_id }).lean();
                    const node = await db.Node.findById(subnet.node_id).lean();

                    item['public_ip'] = node.hostname;
                }

                result = [...result, ...ports];
            }
        }

        return result;
    }

    async getVnc() {
        if (!this.data) return this.send('FillFields', 400);

        const payload = { _id: this.data, user_id: this.session.user };
        if(this.session.isAdmin) delete payload.user_id;

        const vserver = await db.Vserver.findOne(payload).lean();
        if (!vserver) return this.send('NoServer', 404);

        const node = await getNode(vserver.tariff_id);

        const username = 'client' + vserver.numId + '@pve';
        const api = proxmox.proxmoxApi({ host: node.hostname, username, password: vserver.password });

        const proxy = await api.nodes.$(node.name).lxc.$(vserver.ctid).vncproxy.$post({ websocket: 1 });
        const user = await api.access.ticket.$post({ username, password: vserver.password });

        return {
            ip: node.hostname,
            port: proxy.port,
            node: node.name,
            vmid: vserver.ctid,
            ticket: proxy.ticket,
            user: user.ticket
        };
    }

    async reboot() {
        if (!this.data) return this.send('FillFields', 400);

        const payload = { _id: this.data, user_id: this.session.user };
        if(this.session.isAdmin) delete payload.user_id;

        const vserver = await db.Vserver.findOne(payload).lean();
        if (!vserver) return this.send('NoServer', 404);

        const node = await getNode(vserver.tariff_id);

        const username = 'client' + vserver.numId + '@pve';
        const api = proxmox.proxmoxApi({ host: node.hostname, username, password: vserver.password });

        await api.nodes.$(node.name).lxc.$(vserver.ctid).status.reboot.$post({ timeout: 3 });

        return 'Success';
    }

    async resetPassword() {
        if (!this.data) return this.send('FillFields', 400);

        const payload = { _id: this.data, user_id: this.session.user };
        if(this.session.isAdmin) delete payload.user_id;

        const vserver = await db.Vserver.findOne(payload).lean();
        if (!vserver) return this.send('NoServer', 404);

        const node = await getNode(vserver.tariff_id);
        const newPassword = makePassword(12);

        const ssh = new NodeSSH();
        await ssh.connect({
            host: node.hostname,
            username: node.username,
            password: node.password,
            port: 22
        });

        const api = proxmox.proxmoxApi({ host: node.hostname, username: node.username + '@pam', password: node.password });

        await ssh.execCommand(`./passwd.sh ${newPassword} ${vserver.ctid}`, { cwd: '/root' });
        await api.access.password.$put({ userid: `client${vserver.numId}@pve`, password: newPassword });
        await db.Vserver.updateOne({ _id: vserver._id }, { password: newPassword });

        return 'Success';
    }

    async deleteServer() {
        if (!this.data) return this.send('FillFields', 400);

        const payload = { _id: this.data, user_id: this.session.user };
        if(this.session.isAdmin) delete payload.user_id;

        const vserver = await db.Vserver.findOne(payload).lean();
        if (!vserver) return this.send('NoServer', 404);

        const node = await getNode(vserver.tariff_id);

        const ssh = new NodeSSH();
        await ssh.connect({
            host: node.hostname,
            username: node.username,
            password: node.password,
            port: 22
        });

        const api = proxmox.proxmoxApi({ host: node.hostname, username: node.username + '@pam', password: node.password });

        await api.nodes.$(node.name).lxc.$(vserver.ctid).$delete({ force: true, 'destroy-unreferenced-disks': true });

        await db.Vserver.deleteOne({ _id: vserver._id });

        await db.Operation.create({
            user_id: this.session.user,
            description: `Виртуальный сервер №${vserver.numId} удалён`
        });

        return 'Success';
    }

    async reinstall() {
        if (!this.data || !this.data.vserver_id || !this.data.os) return this.send('FillFields', 400);

        const payload = { _id: this.data.vserver_id, user_id: this.session.user };
        if(this.session.isAdmin) delete payload.user_id;

        const vserver = await db.Vserver.findOne(payload).lean();
        if (!vserver) return this.send('NoServer', 404);

        if (!OS_LIST.includes(this.data.os)) return this.send('NoOS', 404);

        const node = await getNode(vserver.tariff_id);
        if (!node) return this.send('NoNode', 404);

        const name = node.name;
        const os = this.data.os;
        const type = getOsType(this.data.os);

        const tariff = await db.Vtariff.findById(vserver.tariff_id).lean();
        if (!tariff) return this.send('NoTariff', 404);

        const ssh = new NodeSSH();
        await ssh.connect({
            host: node.hostname,
            username: node.username,
            password: node.password,
            port: 22
        });

        const api = proxmox.proxmoxApi({ host: node.hostname, username: node.username + '@pam', password: node.password });
        try { await api.nodes.$(name).lxc.$(vserver.ctid).$delete({ force: true, purge: true }) } catch (err) { console.log(err); }

        let lock = true;

        while (lock) {
            await sleep(500);
            try { await api.nodes.$(name).lxc.$(vserver.ctid).$get(); } catch(err) { lock = false; }
        }

        await api.access.acl.$put({ path: `/vms/${vserver.ctid}`, roles: 'VNC', users: `client${vserver.numId}@pve` });

        const ip = await db.Ip.findOne({ ip: vserver.ip, vserver_id: vserver._id, reserved: true }).lean();
        if (!ip) return this.send('NoIp', 404);

        const subnet = await db.Subnet.findById({ _id: ip.subnet_id }).lean();
        if (!subnet) return this.send('NoSubnet', 404);

        const create = await api.nodes.$(name).lxc.$post({
            node: name,
            ostemplate: os,
            vmid: vserver.ctid,
            cores: tariff.vcpu,
            memory: tariff.ram * 1024,
            start: true,
            swap: tariff.ram * 1024 / 2,
            unprivileged: true,
            password: vserver.password,
            rootfs: `local:${tariff.disk}`,
            ostype: type,
            net0: `name=eth0,bridge=vmbr1,firewall=1,gw=${subnet.subnet}.1,ip=${vserver.ip}/24`
        });

        if (!create) return this.send('SystemError', 500);

        setupSSH(node, vserver.ctid);
        await db.Vserver.updateOne({ _id: vserver._id }, { os });

        return 'Success';
    }

    async createVserver() {
        if (!this.data || !this.data.location_id || !this.data.node_id || !this.data.tariff_id || !this.data.password || !this.data.os) return this.send('FillFields', 400);
        if (!PASSWORD_REGEX.test(this.data.password)) return this.send('Password', 400);

        const user = await db.User.findById(this.session.user).lean();
        if (!user) return this.send('NoUser', 403);

        const location = await db.Location.findOne({ _id: this.data.location_id, available: true }).lean();
        if (!location) return this.send('NoLocation', 404);

        const node = await db.Node.findOne({ _id: this.data.node_id, location_id: location._id, available: true }).lean();
        if (!node) return this.send('NoNode', 404);

        const tariff_payload = { _id: this.data.tariff_id, node_id: node._id, available: true };
        if(this.session.isAdmin) delete tariff_payload.available;

        const tariff = await db.Vtariff.findOne(tariff_payload).lean();
        if (!tariff) return this.send('NoTariff', 404);

        if (!OS_LIST.includes(this.data.os)) return this.send('NoOS', 404);

        const price = +(tariff.price / 30 / 24).toFixed(2);
        const new_balance = +(user.balance - price).toFixed(2);

        if (new_balance < -user.credit_limit) return this.send('Balance', 400);

        const subnet = await db.Subnet.findOne({ node_id: node._id }).lean();
        if (!subnet) return this.send('NoSubnet', 400);

        const freeIp = await db.Ip.findOne({ subnet_id: subnet._id, reserved: false }).lean();
        if (!freeIp) return this.send('NoMoreIps', 400);

        if(!this.session.isAdmin) {
            if (!await canOrderVPS(this.session.user, await getLimits(this.session.user), tariff)) return this.send('Limits', 400);
        }

        const api = proxmox.proxmoxApi({ host: node.hostname, username: node.username + '@pam', password: node.password });
        const nextId = await api.cluster.nextid.$get();
        const name = node.name;
        const os = this.data.os;
        const type = getOsType(this.data.os);

        const date = new Date();
        date.setMonth(date.getMonth() + 1);

        const create = await api.nodes.$(name).lxc.$post({
            node: name,
            ostemplate: os,
            vmid: nextId,
            cores: tariff.vcpu,
            memory: tariff.ram * 1024,
            start: true,
            swap: tariff.ram * 1024 / 2,
            unprivileged: true,
            password: this.data.password,
            rootfs: `local:${tariff.disk}`,
            ostype: type,
            net0: `name=eth0,bridge=vmbr1,firewall=1,gw=${subnet.subnet}.1,ip=${freeIp.ip}/24`
        });

        if (!create) return this.send('SystemError', 500);

        const _create = await db.Vserver.create({
            user_id: this.session.user,
            tariff_id: tariff._id,
            ctid: nextId,
            ip: freeIp.ip,
            username: 'root',
            password: this.data.password,
            os: this.data.os,
            price: tariff.price,
            ending_date: date
        });

        const userid = `client${_create.numId}@pve`;
        await api.access.users.$post({ userid, password: this.data.password });
        await api.access.acl.$put({ path: `/vms/${nextId}`, roles: 'VNC', users: userid });

        await db.User.updateOne({ _id: this.session.user }, { balance: new_balance });
        await db.Ip.updateOne({ _id: freeIp._id }, { vserver_id: _create._id, reserved: true });

        await allocPort(freeIp, node, 22);
        setupSSH(node, nextId);

        if (this.data.ports) {
            if (this.data.ports.http) await allocPort(freeIp, node, 80);
            if (this.data.ports.https) await allocPort(freeIp, node, 443);
            if (this.data.ports.ftp) await allocPort(freeIp, node, 21);
            if (this.data.ports.samp) await allocPort(freeIp, node, 7777);
            if (this.data.ports.minecraft) await allocPort(freeIp, node, 25565);
        }

        await db.Operation.create({
            user_id: this.session.user,
            description: `Виртуальный сервер №${_create.numId} создан`
        });

        return _create._id;
    }
}