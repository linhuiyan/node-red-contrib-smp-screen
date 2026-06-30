const dbus = require('dbus-next');

module.exports = function(RED) {
    function SmpScreenOutputNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // 1. 获取用户在弹窗里勾选的变量配置
        node.showAh = config.showAh;
        node.showRate = config.showRate;
        node.showVolt = config.showVolt;

        // 2. 建立本地 D-Bus 管道连接
        const bus = dbus.sessionBus({
            busAddress: 'unix:path=/run/user/1000/bus'
        });

        // 3. 异步启动信号蹲点监听
        async function setupSignalListener() {
            try {
                const proxyObject = await bus.getProxyObject('com.smp.screen', '/Screen');
                const smpInterface = proxyObject.getInterface('local.L7Monitor.SmpDataProtocol');

                // 4. 监听来自 Qt 的广播信号
                smpInterface.on('battDataChanged', (dataList) => {
                    // 自动解包 D-Bus 的 Variant 数组对象，还原为纯数字
                    let realNumbers = dataList.map(item => {
                        return (item && typeof item === 'object' && 'value' in item) ? item.value : item;
                    });

                    // 5. 根据勾选状态动态组装输出字典
                    let outputPayload = {};
                    if (node.showAh)   outputPayload.battery_ah = realNumbers[0];
                    if (node.showRate) outputPayload.charge_rate = realNumbers[1];
                    if (node.showVolt) outputPayload.low_volt = realNumbers[2];

                    // 6. 无条件将组装好的数据往右边抛出
                    node.send({
                        payload: outputPayload
                    });

                    node.status({ fill: "blue", shape: "dot", text: `已输出 ${Object.keys(outputPayload).length} 个勾选变量` });
                });

                node.status({ fill: "green", shape: "ring", text: "已挂载 D-Bus 信号监听" });

            } catch (err) {
                node.error("输出节点挂载 D-Bus 失败: " + err.toString());
                node.status({ fill: "red", shape: "ring", text: "连接失败" });
            }
        }
        
        // 节点初始化时直接运行
        setupSignalListener();

        // 垃圾回收：如果流被删除或重置，断开总线连接
        node.on('close', function(done) {
            bus.disconnect();
            done();
        });
    }

    // 🌟 注册时注意：这里的名字必须跟 package.json 以及 html 里的 data-template-name 一模一样
    RED.nodes.registerType("smp-screen-output", SmpScreenOutputNode);
}