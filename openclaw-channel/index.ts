import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { xiaozhiPlugin } from "./channel.js";
import { setXiaozhiRuntime } from "./runtime.js";
import { emptyPluginConfigSchema } from "./sdk-shim.js";

const plugin = {
  id: "xiaozhi",
  name: "XiaoZhi ESP32",
  description: "XiaoZhi ESP32 Server WebSocket channel integration",
  configSchema: emptyPluginConfigSchema(),
  version: "0.0.5",
  register(api: OpenClawPluginApi) {
    setXiaozhiRuntime(api.runtime);

    // Register channel plugin
    api.registerChannel({ plugin: xiaozhiPlugin as ChannelPlugin });
  },
};

export default plugin;
