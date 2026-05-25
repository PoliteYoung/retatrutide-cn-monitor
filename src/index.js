/**
 * Weekly monitor: check public evidence for whether retatrutide is approved or
 * marketed in China, then send a DingTalk markdown report.
 *
 * This is an alerting aid, not a regulatory determination. Treat NMPA/CDE pages
 * and official company announcements as the source of truth.
 */

const DRUG_KEYWORDS = [
  "retatrutide",
  "ly3437943",
  "ly-3437943",
  "瑞他鲁肽",
  "雷塔鲁肽",
  "瑞他肽"
];

const APPROVAL_KEYWORDS = [
  "批准",
  "获批",
  "上市",
  "注册证",
  "批准文号",
  "进口药品注册证",
  "approved",
  "approval"
];

const NEGATIVE_PATTERNS = [
  /未(获批|批准|上市)/i,
  /尚未(获批|批准|上市)/i,
  /暂未(获批|批准|上市)/i,
  /not yet approved/i,
  /not approved/i
];

const SPECULATIVE_PATTERNS = [
  /将于.*上市/i,
  /预计.*上市/i,
  /有望.*上市/i,
  /何时上市/i,
  /上市吗/i,
  /审批进程/i,
  /submitted for approval/i,
  /plans to submit/i,
  /potential treatment/i,
  /investigational/i
];

const OFFICIAL_DOMAINS = ["nmpa.gov.cn", "cde.org.cn"];

const SOURCES = [
  {
    name: "NMPA 官网搜索：retatrutide",
    type: "page",
    official: true,
    url: "https://www.nmpa.gov.cn/so/s?qt=retatrutide"
  },
  {
    name: "NMPA 官网搜索：瑞他鲁肽",
    type: "page",
    official: true,
    url: "https://www.nmpa.gov.cn/so/s?qt=%E7%91%9E%E4%BB%96%E9%B2%81%E8%82%BD"
  },
  {
    name: "CDE 官网搜索：retatrutide",
    type: "page",
    official: true,
    url: "https://www.cde.org.cn/main/search?keyword=retatrutide"
  },
  {
    name: "Bing RSS：NMPA 域名查询",
    type: "rss",
    official: false,
    url: bingRssUrl("site:nmpa.gov.cn (retatrutide OR LY3437943 OR 瑞他鲁肽 OR 雷塔鲁肽) (批准 OR 获批 OR 上市 OR 注册证)")
  },
  {
    name: "Bing RSS：CDE 域名查询",
    type: "rss",
    official: false,
    url: bingRssUrl("site:cde.org.cn (retatrutide OR LY3437943 OR 瑞他鲁肽 OR 雷塔鲁肽)")
  },
  {
    name: "Bing RSS：公开网页交叉检查",
    type: "rss",
    official: false,
    url: bingRssUrl("(retatrutide OR LY3437943 OR 瑞他鲁肽 OR 雷塔鲁肽) 中国 (获批 OR 批准 OR 上市 OR NMPA OR 药监局)")
  },
  {
    name: "礼来投资者新闻搜索",
    type: "page",
    official: false,
    url: "https://investor.lilly.com/search?query=retatrutide"
  }
];

function bingRssUrl(query) {
  const params = new URLSearchParams({ format: "rss", q: query });
  return `https://www.bing.com/search?${params.toString()}`;
}

function nowBeijingDateString() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(new Date())
    .replaceAll("/", "-");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (compatible; retatrutide-cn-monitor/0.1; GitHub Actions)"
      }
    });

    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      text
    };
  } finally {
    clearTimeout(timeout);
  }
}

function htmlToText(text) {
  return decodeEntities(
    text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function hasAny(text, words) {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word.toLowerCase()));
}

function hasNegative(text) {
  return NEGATIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasSpeculative(text) {
  return SPECULATIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function isOfficialUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function scoreText(text) {
  const drugHit = hasAny(text, DRUG_KEYWORDS);
  const approvalHit = hasAny(text, APPROVAL_KEYWORDS);
  const negativeHit = hasNegative(text);
  const speculativeHit = hasSpeculative(text);
  const strongApprovalHit = approvalHit && !negativeHit && !speculativeHit;
  return { drugHit, approvalHit, negativeHit, speculativeHit, strongApprovalHit };
}

function parseRssItems(xml) {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  return itemBlocks.map((block) => ({
    title: decodeEntities((block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim()),
    url: decodeEntities((block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim()),
    description: htmlToText(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || ""),
    pubDate: decodeEntities((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim())
  }));
}

function truncate(text, max = 220) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

async function collectEvidence(source) {
  const fetched = await fetchText(source.url);
  const base = {
    sourceName: source.name,
    sourceUrl: source.url,
    official: source.official,
    httpStatus: fetched.status,
    ok: fetched.ok,
    items: [],
    note: fetched.ok ? "" : "请求未成功，可能被反爬、拦截、重定向或临时不可用"
  };

  if (source.type === "rss") {
    const items = parseRssItems(fetched.text)
      .map((item) => {
        const text = `${item.title}\n${item.description}\n${item.url}`;
        return {
          ...item,
          official: isOfficialUrl(item.url),
          ...scoreText(text)
        };
      })
      .filter((item) => item.drugHit || item.official)
      .slice(0, 5);

    return { ...base, items };
  }

  const text = htmlToText(fetched.text);
  const scored = scoreText(text);
  const looksProtected =
    fetched.status === 412 ||
    /precondition failed|安全验证|访问验证|请开启javascript/i.test(text);

  return {
    ...base,
    items: [
      {
        title: source.name,
        url: source.url,
        description: truncate(text, 260),
        pubDate: "",
        official: source.official || isOfficialUrl(source.url),
        ...scored
      }
    ],
    note: looksProtected
      ? "页面疑似有访问验证，GitHub Actions 可能只能记录可访问性，不能直接解析内容"
      : base.note
  };
}

function classify(evidences) {
  const allItems = evidences.flatMap((source) =>
    source.items.map((item) => ({ ...item, sourceName: source.sourceName }))
  );
  const officialApproval = allItems.filter(
    (item) => item.official && item.drugHit && item.strongApprovalHit
  );
  const anyApproval = allItems.filter(
    (item) => item.drugHit && item.strongApprovalHit
  );
  const officialDrug = allItems.filter((item) => item.official && item.drugHit);
  const negative = allItems.filter((item) => item.drugHit && item.negativeHit);

  if (officialApproval.length > 0) {
    return {
      level: "needs-review",
      text: "疑似发现官方“获批/上市/注册证”线索，需要人工立即复核"
    };
  }
  if (anyApproval.length > 0) {
    return {
      level: "watch",
      text: "发现非官方或搜索结果中的“获批/上市”线索，尚未发现官方确认"
    };
  }
  if (officialDrug.length > 0) {
    return {
      level: "watch",
      text: "官方域名发现 retatrutide 相关线索，但未发现上市/获批证据"
    };
  }
  if (negative.length > 0) {
    return {
      level: "unchanged",
      text: "发现相关页面提到“未获批/未上市”等表述"
    };
  }
  return {
    level: "unchanged",
    text: "未发现 retatrutide 在中国获批/上市的明确公开线索"
  };
}

function buildMarkdownReport({ status, evidences }) {
  const dateStr = nowBeijingDateString();
  const title = `Retatrutide/瑞他鲁肽 中国上市监测 ${dateStr}`;
  const lines = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`**结论：${status.text}**`);
  lines.push("");
  lines.push("说明：这是公开网页线索监测，不等同于药品注册结论；最终请以 NMPA/CDE 数据库、公告及企业官方披露为准。");
  lines.push("");
  lines.push("## 本次检查");

  for (const source of evidences) {
    const hitItems = source.items.filter((item) => item.drugHit || item.approvalHit);
    const summary = hitItems.length > 0 ? `发现 ${hitItems.length} 条相关线索` : "未发现相关线索";
    const officialText = source.official ? "官方/权威入口" : "辅助来源";
    lines.push(`- ${summary}｜${officialText}｜[${source.sourceName}](${source.sourceUrl})｜HTTP ${source.httpStatus}`);
    if (source.note) lines.push(`  - 备注：${source.note}`);

    for (const item of hitItems.slice(0, 3)) {
      const flags = [
        item.official ? "官方域名" : "非官方域名",
        item.strongApprovalHit ? "强获批/上市线索" : item.approvalHit ? "含获批/上市词" : "无获批/上市词",
        item.negativeHit ? "含否定词" : "",
        item.speculativeHit ? "含预测/展望词" : ""
      ].filter(Boolean);
      lines.push(`  - ${flags.join("，")}：[${truncate(item.title, 80)}](${item.url})`);
      if (item.description) lines.push(`    - ${truncate(item.description, 140)}`);
    }
  }

  lines.push("");
  lines.push("## 判断规则");
  lines.push("- 优先看 NMPA/CDE 官方域名是否同时命中 retatrutide/中文别名和获批、上市、注册证、批准文号等关键词。");
  lines.push("- 搜索结果会过滤明显不相关条目；若官方站点返回访问验证，会在报告中标记为不可解析。");

  return { title, text: lines.join("\n") };
}

async function sendToDingTalkMarkdown({ webhook, title, text }) {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { title, text }
    })
  });

  const raw = await res.text().catch(() => "");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (!res.ok || (parsed && parsed.errcode !== 0)) {
    throw new Error(`DingTalk webhook failed: HTTP ${res.status} ${raw}`);
  }
  return raw;
}

function buildWpusherUrl({ webhookUrl, title, content }) {
  if (webhookUrl.includes("$title") || webhookUrl.includes("$content")) {
    return webhookUrl
      .replaceAll("$title", encodeURIComponent(title))
      .replaceAll("$content", encodeURIComponent(content));
  }

  const url = new URL(webhookUrl);
  url.searchParams.set("title", title);
  url.searchParams.set("content", content);
  return url.toString();
}

async function sendToWpusher({ webhookUrl, authorization, title, text }) {
  const url = buildWpusherUrl({ webhookUrl, title, content: text });
  const headers = {
    "content-type": "application/json"
  };
  if (authorization) headers.authorization = authorization;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ title, content: text })
  });

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Wpusher webhook failed: HTTP ${res.status} ${raw}`);
  }
  return raw;
}

async function main() {
  const dingtalkWebhook = process.env.DINGTALK_WEBHOOK;
  const wpusherWebhook = process.env.WPUSHER_WEBHOOK_URL;
  const wpusherAuthorization = process.env.WPUSHER_AUTHORIZATION;
  const dryRun = process.env.DINGTALK_DRY_RUN === "1";

  if (!dingtalkWebhook && !wpusherWebhook && !dryRun) {
    throw new Error(
      "Missing webhook configuration. Set DINGTALK_WEBHOOK and/or WPUSHER_WEBHOOK_URL as GitHub Actions secrets."
    );
  }

  const evidences = [];
  for (const source of SOURCES) {
    try {
      evidences.push(await collectEvidence(source));
    } catch (err) {
      evidences.push({
        sourceName: source.name,
        sourceUrl: source.url,
        official: source.official,
        httpStatus: 0,
        ok: false,
        items: [],
        note: `抓取失败：${err?.message || String(err)}`
      });
    }
  }

  const status = classify(evidences);
  const report = buildMarkdownReport({ status, evidences });

  if (dryRun) {
    console.log(report.text);
    return;
  }

  const sends = [];
  if (dingtalkWebhook) {
    sends.push(sendToDingTalkMarkdown({ webhook: dingtalkWebhook, ...report }));
  }
  if (wpusherWebhook) {
    sends.push(
      sendToWpusher({
        webhookUrl: wpusherWebhook,
        authorization: wpusherAuthorization,
        ...report
      })
    );
  }

  await Promise.all(sends);
  console.log(`Sent ${sends.length} webhook report(s) OK.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
