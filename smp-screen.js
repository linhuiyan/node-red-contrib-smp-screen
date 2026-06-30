const dbus = require('dbus-next');

module.exports = function(RED) {
    function SmpScreenNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.action = config.action; // 获取用户在双击面板里选的是哪个方法

        // 【关键改动】这里必须跟 Qt 一样，直接指定真实的物理管道地址！
        const bus = dbus.sessionBus({
            busAddress: 'unix:path=/run/user/1000/bus'
        });

        // 2. 监听输入事件：当左边小圆点收到别处传来的消息时
        node.on('input', async function(msg) {
            try {
                // 3. 动态抓取你在 Qt 里注册的 Service 名和 Object 路径
                const proxyObject = await bus.getProxyObject('com.smp.screen', '/Screen');
                
                // 4. 获取接口 (Qt 默认用服务名作为默认 Interface 空间名)
                const smpInterface = proxyObject.getInterface('local.L7Monitor.SmpDataProtocol');

                // 5. 根据节点选中的动作，调用对应的 C++ 槽函数
                if (node.action === 'setEL6Enable') {
                    let brightness = parseInt(msg.payload); // 拿到输入的亮度数字
                    
                    // 【核心】直接隔空触发你的 C++ DbusManager::setBrightness(int)
                    await smpInterface.setEL6Enable(brightness);
                    
                    node.status({ fill: "green", shape: "dot", text: `已设置el6使能: ${brightness}` });
                    node.send(msg); // 把消息继续往右传
                } 
                else if (node.action === 'getBattNum') {
                    // 【核心】直接调用你的 C++ DbusManager::getSoc() 拿到 85
                    let replySoc = await smpInterface.getBattNum();
                    
                    msg.payload = replySoc; // 把 85 赋值给 payload
                    node.status({ fill: "blue", shape: "dot", text: `读取电池数量: ${replySoc}%` });
                    node.send(msg); // 把 85 吐给下一个积木
                }
            } catch (err) {
                node.error(" D-Bus 通信报错啦: " + err.toString(), msg);
                node.status({ fill: "red", shape: "ring", text: "D-Bus 连接失败" });
            }
        });

        // 当节点被销毁或流重新部署时，断开 D-Bus 连接释放内存
        node.on('close', function() {
            bus.disconnect();
        });
    }

    // 告诉 Node-RED 引擎：注册这个叫 smp-screen-node 的新积木
    RED.nodes.registerType("smp-screen-node", SmpScreenNode);
}
