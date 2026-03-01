import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { xiaozhiPlugin } from "./channel.js";
import { setXiaozhiRuntime } from "./runtime.js";

const plugin = {
  id: "xiaozhi",
  name: "XiaoZhi ESP32",
  description: "XiaoZhi ESP32 Server WebSocket channel integration",
  configSchema: emptyPluginConfigSchema(),
  version: "1.0.0",
  register(api: OpenClawPluginApi) {
    setXiaozhiRuntime(api.runtime);

    // Register channel plugin
    api.registerChannel({ plugin: xiaozhiPlugin as ChannelPlugin });
  },
};

export default plugin;
