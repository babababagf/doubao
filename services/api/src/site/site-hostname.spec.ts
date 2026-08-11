import { describe, expect, it } from "vitest";

import { resolveContentSiteHostname } from "./site-hostname";

describe("企业内容站域名解析", () => {
  it("优先使用已生效的商户自有站点域名", () => {
    expect(
      resolveContentSiteHostname("merchant-a", {
        merchantHostname: "www.merchant.example.com",
        agentRootHostname: "agent.example.com",
        whiteLabelRootHostname: "white.example.com",
        platformRootHostname: "content.platform.example.com",
      }),
    ).toBe("www.merchant.example.com");
  });

  it("按代理、贴牌、平台默认根域名依次分配稳定二级域名", () => {
    expect(
      resolveContentSiteHostname("merchant-a", {
        merchantHostname: null,
        agentRootHostname: "agent.example.com",
        whiteLabelRootHostname: "white.example.com",
        platformRootHostname: "content.platform.example.com",
      }),
    ).toBe("site-merchant-a.agent.example.com");
    expect(
      resolveContentSiteHostname("merchant-a", {
        merchantHostname: null,
        agentRootHostname: null,
        whiteLabelRootHostname: "white.example.com",
        platformRootHostname: "content.platform.example.com",
      }),
    ).toBe("site-merchant-a.white.example.com");
    expect(
      resolveContentSiteHostname("merchant-a", {
        merchantHostname: null,
        agentRootHostname: null,
        whiteLabelRootHostname: null,
        platformRootHostname: "content.platform.example.com",
      }),
    ).toBe("site-merchant-a.content.platform.example.com");
  });

  it("没有已配置根域名时保持本地预览，不伪造线上域名", () => {
    expect(
      resolveContentSiteHostname("merchant-a", {
        merchantHostname: null,
        agentRootHostname: null,
        whiteLabelRootHostname: null,
        platformRootHostname: null,
      }),
    ).toBeNull();
  });
});
