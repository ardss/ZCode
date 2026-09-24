import { createLocalServices, getAppConfigDir } from "@zcode/services/node";
import {
  materializeBundledZCodeBuiltinProviderConfig,
  readBundledZCodeBuiltinProviderConfig,
} from "./bundledZCodeBuiltinProviderConfig.js";
import { createHttpServer } from "./http.js";

/** 参考 runner.mjs 的 isLocalHost：仅这些地址视为本机回环。 */
function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

async function main(): Promise<void> {
  const zcodeBuiltinProviderConfigFilePath = await materializeBundledZCodeBuiltinProviderConfig({
    environmentConfigRoot: getAppConfigDir(),
    content: readBundledZCodeBuiltinProviderConfig(),
  });
  const port = Number(process.env["PORT"]) || 3030;
  // 默认仅绑定本机 loopback，避免无意暴露到局域网/公网；仍可用
  // ZCODE_SERVER_HOST / HOST 环境变量显式覆盖绑定地址。
  const host = process.env["ZCODE_SERVER_HOST"]?.trim() || process.env["HOST"]?.trim() || "127.0.0.1";
  const staticRoot = process.env["ZCODE_WEB_STATIC_ROOT"]?.trim() || undefined;
  const authToken = process.env["ZCODE_SERVER_AUTH_TOKEN"]?.trim() || undefined;
  // Fail-closed：绑定到非 loopback 地址却不配 token，等于把本机 RPC 面板裸奔到
  // 外部，与 scripts/zcode-distribution/runner.mjs 的做法一致，直接拒绝启动。
  if (!isLoopbackHost(host) && !authToken) {
    console.error(
      `[zcode-server:http] refusing to bind non-loopback host ${host} without ZCODE_SERVER_AUTH_TOKEN; set ZCODE_SERVER_AUTH_TOKEN or use 127.0.0.1`,
    );
    process.exitCode = 1;
    return;
  }
  const services = createLocalServices({
    zcodeBuiltinProviderConfigFilePath,
    providerProvisioningTargetEnabled: Boolean(authToken),
  });

  createHttpServer(services, port, {
    ...(host ? { host } : {}),
    ...(staticRoot ? { staticRoot, spaFallback: true } : {}),
    ...(authToken ? { authToken, authRequired: true } : {}),
  });
}

void main().catch((error: unknown) => {
  console.error("[zcode-server:http] startup failed", error);
  process.exitCode = 1;
});
