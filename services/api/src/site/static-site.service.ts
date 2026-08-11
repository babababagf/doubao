import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as nunjucks from "nunjucks";
import sanitizeHtml from "sanitize-html";

import { sanitizeArticleContent } from "../content/article-sanitizer";

import {
  ArticleStatus,
  DomainBindingStatus,
  DomainPurpose,
  Prisma,
  WebsiteStatus,
  WebsiteTemplate,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ObjectStorageConfigService,
  type StaticSiteObject,
} from "../tenancy/object-storage-config.service";
import { PlatformDomainConfigService } from "../tenancy/platform-domain-config.service";
import { resolveContentSiteHostname } from "./site-hostname";

type SiteFile = { content: string; path: string };
type SiteArtifactStorage = Pick<
  ObjectStorageConfigService,
  "merchantStorageAvailable" | "uploadMerchantSiteVersion"
>;

export function staticSiteContentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

export async function stageStaticSiteArtifact(
  storage: SiteArtifactStorage,
  input: {
    tenantId: string;
    version: number;
    directory: string;
    paths: string[];
  },
): Promise<{
  objectPrefix: string;
  manifestUrl: string;
  uploadedAt: Date;
} | null> {
  if (!(await storage.merchantStorageAvailable(input.tenantId))) return null;
  const files: StaticSiteObject[] = await Promise.all(
    input.paths.map(async (path) => ({
      path,
      content: await readFile(join(input.directory, path)),
      contentType: staticSiteContentType(path),
    })),
  );
  const uploaded = await storage.uploadMerchantSiteVersion(
    input.tenantId,
    input.version,
    files,
  );
  return { ...uploaded, uploadedAt: new Date() };
}

const siteRoot = resolve(process.cwd(), "services/api/.runtime/sites");
const renderer = new nunjucks.Environment(null, { autoescape: true });
const templateTheme: Record<
  WebsiteTemplate,
  { accent: string; label: string; id: string }
> = {
  [WebsiteTemplate.MINIMAL_ENTERPRISE]: {
    accent: "#2459d6",
    label: "简约企业型",
    id: "minimal",
  },
  [WebsiteTemplate.LOCAL_STORE]: {
    accent: "#067f70",
    label: "本地门店型",
    id: "store",
  },
  [WebsiteTemplate.BRAND_CONTENT]: {
    accent: "#c38a32",
    label: "品牌内容型",
    id: "brand",
  },
};

const baseStyle = `:root{--accent:{{ accent }};--ink:#14213b;--muted:#5d6b82;--line:#dfe5ee;--paper:#fff}*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:var(--ink);font:16px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}a{color:inherit}.site-width{width:min(1160px,calc(100% - 40px));margin:auto}.top{display:flex;align-items:center;justify-content:space-between;min-height:74px}.brand{font-size:19px;font-weight:750;letter-spacing:-.02em;text-decoration:none}.top small,.eyebrow,.meta{color:var(--muted);font-size:12px}.eyebrow{display:block;margin-bottom:12px;font:700 11px/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.13em;text-transform:uppercase}.phone{display:inline-flex;align-items:center;min-height:42px;padding:0 17px;border-radius:6px;background:var(--accent);color:#fff;font-weight:700;text-decoration:none}.articles{display:grid;gap:1px;background:var(--line);border:1px solid var(--line)}.article-link{display:block;padding:20px;background:#fff;text-decoration:none}.article-link:hover{background:#f8faff}.article-link strong{display:block;font-size:17px}.article-link span{display:block;margin-top:5px;color:var(--muted);font-size:13px}.contact-card{padding:27px;background:#fff;border:1px solid var(--line)}.contact-card h2{margin:0 0 14px;font-size:20px}.contact-card p{margin:0 0 10px}.image-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.image-grid img{width:100%;height:180px;object-fit:cover;background:#e5eaf2}.article-page{min-height:100vh;background:#fff}.article-page .top{border-bottom:1px solid var(--line)}.article{width:min(760px,calc(100% - 40px));padding:58px 0 72px;margin:auto}.article h1{margin:0 0 12px;font-size:42px;line-height:1.25;letter-spacing:-.045em}.article h2{margin-top:38px;font-size:25px}.article article{margin-top:30px}.article article p,.article article li{color:#273955}.article-footer{margin-top:44px;padding-top:24px;border-top:1px solid var(--line)}.site-footer{padding:30px 0;color:var(--muted);font-size:12px}.minimal{background:#fff}.minimal .top{border-bottom:1px solid var(--line)}.minimal .hero{padding:85px 0 76px;background:linear-gradient(118deg,#f9fbff 0%,#eef3ff 58%,#fff 100%)}.minimal h1{max-width:860px;margin:0;font-size:52px;line-height:1.18;letter-spacing:-.06em}.minimal .hero p{max-width:710px;margin:20px 0 0;color:var(--muted);font-size:18px}.minimal .content-grid{display:grid;grid-template-columns:minmax(0,1.5fr) 330px;gap:56px;padding:62px 0}.minimal .section-title{margin:0 0 20px;font-size:25px}.minimal .service-list{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:0 0 34px;padding:0;list-style:none}.minimal .service-list li{padding:13px 15px;border-left:2px solid var(--accent);background:#f6f8fc}.store{background:#f4faf8}.store .top{min-height:66px}.store .store-hero{padding:40px 0 48px;background:var(--accent);color:#fff}.store h1{max-width:720px;margin:0;font-size:45px;line-height:1.25;letter-spacing:-.05em}.store .store-hero p{max-width:670px;margin:16px 0 0;color:rgba(255,255,255,.82)}.store .store-layout{display:grid;grid-template-columns:330px minmax(0,1fr);gap:28px;padding:28px 0 62px}.store .local-facts{padding:26px;background:#fff;border-top:4px solid var(--accent)}.store .local-facts h2{margin:0 0 15px;font-size:20px}.store .local-facts dl{margin:0}.store .local-facts dt{margin-top:14px;color:var(--muted);font-size:11px}.store .local-facts dd{margin:2px 0 0}.store .store-content h2{margin:0 0 18px;font-size:28px}.store .service-list{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:0 0 25px;padding:0;list-style:none}.store .service-list li{padding:15px;border-radius:8px;background:#e4f2ee;color:#15554d}.brand-site{background:#0d1624;color:#edf3ff}.brand-site .top{border-bottom:1px solid rgba(255,255,255,.12)}.brand-site .top small{color:#a7b2c7}.brand-site .brand-hero{padding:80px 0 48px;background:radial-gradient(circle at 78% 5%,#25395b 0,transparent 34%),#0d1624}.brand-site h1{max-width:830px;margin:0;font:700 clamp(42px,6vw,72px)/1.08 Georgia,"Songti SC",serif;letter-spacing:-.06em}.brand-site .brand-hero p{max-width:650px;margin:22px 0 0;color:#b3c0d3;font-size:18px}.brand-site .brand-layout{display:grid;grid-template-columns:minmax(0,1.4fr) .6fr;gap:28px;padding:35px 0 66px}.brand-site .story{padding:30px;background:#152237}.brand-site .story h2{margin:0 0 12px;font:700 29px/1.25 Georgia,"Songti SC",serif}.brand-site .story p{color:#c6d1df}.brand-site .articles{border-color:#2b3a53;background:#2b3a53}.brand-site .article-link{background:#152237}.brand-site .article-link:hover{background:#1c2d47}.brand-site .article-link span{color:#aebcd0}.brand-site .contact-card{border-color:#2b3a53;background:#111d30}.brand-site .contact-card p{color:#c6d1df}.brand-site .image-grid img{height:132px}.brand-site .site-footer{color:#95a5bc}@media(max-width:760px){.site-width{width:min(100% - 32px,1160px)}.minimal .hero,.brand-site .brand-hero{padding:56px 0}.minimal h1,.store h1{font-size:37px}.brand-site h1{font-size:45px}.minimal .content-grid,.store .store-layout,.brand-site .brand-layout{grid-template-columns:1fr;gap:24px;padding:32px 0}.minimal .service-list,.store .service-list{grid-template-columns:1fr}.image-grid img{height:110px}.article{padding-top:38px}.article h1{font-size:32px}.top small{display:none}}`;

const trackingTemplate = `{% if phone %}<script>(()=>{const endpoint='/api/public/sites/{{ tenantId }}/events',page=location.pathname,storageKey='dh_phone_visit';let visitId=sessionStorage.getItem(storageKey);if(!visitId){visitId=crypto.randomUUID();sessionStorage.setItem(storageKey,visitId)}const send=type=>fetch(endpoint,{method:'POST',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({type,page,visitId})}).catch(()=>{});const phone=document.getElementById('phone-link');if(!phone)return;const observe=()=>{if(!('IntersectionObserver'in window)){send('phone_exposure');return}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){send('phone_exposure');observer.disconnect()}},{threshold:.5});observer.observe(phone)};observe();phone.addEventListener('click',()=>send('phone_click'))})()</script>{% endif %}`;
const faviconTemplate = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%230d1624'/%3E%3Cpath d='M18 18h14c9 0 15 5.7 15 14s-6 14-15 14H18z' fill='%236f72ff'/%3E%3C/svg%3E" type="image/svg+xml">`;
const navigationTemplate = `<nav aria-label="站点导航" style="display:flex;flex:1;align-items:center;justify-content:center;flex-wrap:wrap;gap:14px;font-size:13px"><a href="{{ navPrefix }}index.html">首页</a>{% if hasServices %}<a href="{{ navPrefix }}services.html">服务</a>{% endif %}{% if hasQuestions %}<a href="{{ navPrefix }}questions.html">问题</a>{% endif %}{% if hasAbout %}<a href="{{ navPrefix }}about.html">关于</a>{% endif %}</nav>`;
const withNavigation = (template: string): string =>
  template.replace("</header>", `${navigationTemplate}</header>`);
const infoPageTemplate = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{ pageTitle }}｜{{ companyName }}</title><meta name="description" content="{{ description }}"><meta name="robots" content="index,follow">${faviconTemplate}<style>${baseStyle}</style>{% if faqJsonLd %}<script type="application/ld+json">{{ faqJsonLd | safe }}</script>{% endif %}</head><body class="article-page {{ templateId }}{% if templateId == 'brand' %}-site{% endif %}"><header class="site-width top"><a class="brand" href="index.html">{{ companyName }}</a><small>{{ themeLabel }}</small></header><main class="article"><span class="eyebrow">{{ pageTitle }}</span><h1>{{ pageTitle }}</h1>{% if pageType == 'services' %}<ul>{% for item in products %}<li>{{ item }}</li>{% endfor %}</ul>{% elif pageType == 'questions' %}{% for item in questions %}<section><h2>{{ item.text }}</h2><p>{{ item.answer }}</p></section>{% endfor %}{% else %}{% if introduction %}<p>{{ introduction }}</p>{% endif %}{% if coreBusiness %}<h2>核心业务</h2><p>{{ coreBusiness }}</p>{% endif %}{% if address %}<h2>联系地址</h2><p>{{ address }}</p>{% endif %}{% if businessHours %}<h2>营业时间</h2><p>{{ businessHours }}</p>{% endif %}{% if wechat %}<h2>微信咨询</h2><p>{{ wechat }}</p>{% endif %}{% endif %}<div class="article-footer">{% if phone %}<a id="phone-link" class="phone" href="tel:{{ phone }}">电话咨询：{{ phone }}</a>{% endif %}</div></main><footer class="site-width site-footer">内容来自企业资料与已发布文章；请以实际服务信息为准。</footer>${trackingTemplate}</body></html>`;
const homeTemplate = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{ companyName }}｜{{ coreBusiness or industry or '企业服务' }}</title><meta name="description" content="{{ description }}"><meta name="robots" content="index,follow">${faviconTemplate}<style>${baseStyle}</style><script type="application/ld+json">{{ jsonLd | safe }}</script></head><body class="{{ templateId }}{% if templateId == 'brand' %}-site{% endif %}"><header class="site-width top"><a class="brand" href="./index.html">{{ companyName }}</a><small>{{ themeLabel }}</small></header>{% if templateId == 'minimal' %}<section class="hero"><div class="site-width"><span class="eyebrow">Enterprise brief / {{ industry or '企业服务' }}</span><h1>{{ companyName }}{% if coreBusiness %}<br>{{ coreBusiness }}{% endif %}</h1><p>{{ introduction or '以真实企业资料、可核验服务内容和清晰联系方式，建立可持续更新的企业内容站。' }}</p></div></section><main class="site-width content-grid"><section><h2 class="section-title">服务与内容</h2>{% if products.length %}<ul class="service-list">{% for product in products %}<li>{{ product }}</li>{% endfor %}</ul>{% endif %}{% if articles.length %}<div class="articles">{% for article in articles %}<a class="article-link" href="articles/{{ article.id }}.html"><strong>{{ article.title }}</strong><span>{{ article.summary }}</span></a>{% endfor %}</div>{% else %}<p class="meta">暂未发布内容文章。</p>{% endif %}</section><aside class="contact-card"><h2>联系咨询</h2>{% if address %}<p>{{ address }}</p>{% endif %}{% if businessHours %}<p class="meta">营业时间：{{ businessHours }}</p>{% endif %}{% if phone %}<a id="phone-link" class="phone" href="tel:{{ phone }}">电话咨询：{{ phone }}</a>{% endif %}{% if wechat %}<p class="meta">微信：{{ wechat }}</p>{% endif %}</aside></main>{% elif templateId == 'store' %}<section class="store-hero"><div class="site-width"><span class="eyebrow" style="color:#d8f6ef">LOCAL SERVICE / {{ industry or '本地服务' }}</span><h1>{{ companyName }}</h1><p>{{ coreBusiness or introduction or '请根据实际到店服务信息联系咨询。' }}</p></div></section><main class="site-width store-layout"><aside class="local-facts"><h2>到店信息</h2><dl>{% if address %}<dt>地址</dt><dd>{{ address }}</dd>{% endif %}{% if businessHours %}<dt>营业时间</dt><dd>{{ businessHours }}</dd>{% endif %}{% if phone %}<dt>联系电话</dt><dd><a id="phone-link" class="phone" href="tel:{{ phone }}">{{ phone }}</a></dd>{% endif %}{% if wechat %}<dt>微信咨询</dt><dd>{{ wechat }}</dd>{% endif %}</dl></aside><section class="store-content"><h2>服务项目</h2>{% if products.length %}<ul class="service-list">{% for product in products %}<li>{{ product }}</li>{% endfor %}</ul>{% endif %}<h2>常见问题与内容</h2>{% if articles.length %}<div class="articles">{% for article in articles %}<a class="article-link" href="articles/{{ article.id }}.html"><strong>{{ article.title }}</strong><span>{{ article.summary }}</span></a>{% endfor %}</div>{% else %}<p class="meta">暂未发布内容文章。</p>{% endif %}</section></main>{% else %}<section class="brand-hero"><div class="site-width"><span class="eyebrow" style="color:#e1bd7e">BRAND JOURNAL / {{ industry or '企业内容' }}</span><h1>{{ companyName }}</h1><p>{{ introduction or coreBusiness or '从企业的真实服务和内容出发，持续沉淀可阅读、可追溯的品牌资料。' }}</p></div></section><main class="site-width brand-layout"><section class="story"><h2>{{ coreBusiness or '企业故事与服务' }}</h2><p>{{ introduction or '本站仅呈现企业已维护的公开资料与已发布内容，不使用随机数据或虚构承诺。' }}</p>{% if galleryImages.length %}<div class="image-grid">{% for image in galleryImages %}<img src="{{ image.url }}" alt="{{ image.alt }}" loading="lazy">{% endfor %}</div>{% endif %}</section><aside class="contact-card"><h2>与我们联系</h2>{% if phone %}<p><a id="phone-link" class="phone" href="tel:{{ phone }}">电话咨询</a></p>{% endif %}{% if wechat %}<p>微信：{{ wechat }}</p>{% endif %}{% if address %}<p class="meta">{{ address }}</p>{% endif %}</aside><section style="grid-column:1/-1"><span class="eyebrow" style="color:#e1bd7e">LATEST ARTICLES</span>{% if articles.length %}<div class="articles">{% for article in articles %}<a class="article-link" href="articles/{{ article.id }}.html"><strong>{{ article.title }}</strong><span>{{ article.summary }}</span></a>{% endfor %}</div>{% else %}<p class="meta">暂未发布内容文章。</p>{% endif %}</section></main>{% endif %}<footer class="site-width site-footer">内容来自企业资料与已发布文章；请以实际服务信息为准。</footer>${trackingTemplate}</body></html>`;
const articleTemplate = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{ article.title }}｜{{ companyName }}</title><meta name="description" content="{{ article.summary }}"><meta name="robots" content="index,follow">${faviconTemplate}<style>${baseStyle}</style></head><body class="article-page {{ templateId }}{% if templateId == 'brand' %}-site{% endif %}"><header class="site-width top"><a class="brand" href="../index.html">{{ companyName }}</a><small>企业内容文章</small></header><main class="article"><span class="eyebrow">{{ themeLabel }}</span><h1>{{ article.title }}</h1><p class="meta">本文内容来自企业资料与可发布文章。</p>{% if article.images.length %}<div class="image-grid">{% for image in article.images %}<img src="{{ image.url }}" alt="{{ image.alt }}" loading="lazy">{% endfor %}</div>{% endif %}<article>{{ article.content | safe }}</article><div class="article-footer">{% if phone %}<a id="phone-link" class="phone" href="tel:{{ phone }}">电话咨询：{{ phone }}</a>{% endif %}</div></main><footer class="site-width site-footer">内容来自企业资料与已发布文章；请以实际服务信息为准。</footer>${trackingTemplate}</body></html>`;

@Injectable()
export class StaticSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformDomains: PlatformDomainConfigService,
    private readonly storage: ObjectStorageConfigService,
  ) {}

  async generate(
    tenantId: string,
  ): Promise<{
    template: WebsiteTemplate;
    hostname: string | null;
    status: WebsiteStatus;
    lastGeneratedAt: Date;
    version: number;
    profileVersion: number;
    previewUrl: string;
    artifactUploadedAt: Date | null;
  }> {
    const [website, tenant] = await Promise.all([
      this.prisma.merchantWebsite.upsert({
        where: { tenantId },
        update: {},
        create: { tenantId },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { profile: true },
      }),
    ]);
    if (!tenant?.profile)
      throw new ConflictException({
        code: "SITE_PROFILE_REQUIRED",
        message: "请先完善网站信息后再生成网站",
      });
    const profileVersion = await this.prisma.merchantProfileVersion.findUnique({
      where: {
        profileId_version: {
          profileId: tenant.profile.id,
          version: tenant.profile.version,
        },
      },
    });
    if (!profileVersion)
      throw new ConflictException({
        code: "SITE_PROFILE_VERSION_MISSING",
        message: "网站信息版本快照缺失，请重新保存网站信息后再生成网站",
      });
    const rootTenantIds = [
      ...new Set(
        [tenant.parentId, tenant.whiteLabelId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ];
    const [
      articles,
      questions,
      merchantDomain,
      inheritedRoots,
      platformRootHostname,
    ] = await Promise.all([
      this.prisma.article.findMany({
        where: { tenantId, deletedAt: null, status: ArticleStatus.PUBLISHABLE },
        select: { id: true, title: true, content: true, galleryImageIds: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      this.prisma.question.findMany({
        where: { tenantId, deletedAt: null, status: "ENABLED" },
        select: { text: true },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      this.prisma.domainBinding.findFirst({
        where: {
          tenantId,
          purpose: DomainPurpose.CONTENT_HOST,
          status: DomainBindingStatus.ACTIVE,
        },
        select: { hostname: true },
        orderBy: { createdAt: "asc" },
      }),
      rootTenantIds.length
        ? this.prisma.domainBinding.findMany({
            where: {
              tenantId: { in: rootTenantIds },
              purpose: DomainPurpose.CONTENT_ROOT,
              status: DomainBindingStatus.ACTIVE,
            },
            select: { tenantId: true, hostname: true },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      this.platformDomains.contentRootHostname(),
    ]);
    const requestedImageIds = [
      ...new Set(
        articles.flatMap((article) =>
          this.stringArray(article.galleryImageIds),
        ),
      ),
    ];
    const galleryImages = requestedImageIds.length
      ? await this.prisma.galleryImage.findMany({
          where: {
            id: { in: requestedImageIds },
            deletedAt: null,
            publicUrl: { not: null },
            gallery: { tenantId, deletedAt: null },
          },
          select: { id: true, fileName: true, publicUrl: true },
        })
      : [];
    const version = website.version + 1;
    const directory = this.versionDirectory(tenantId, version);
    await mkdir(join(directory, "articles"), { recursive: true });
    const profile = profileVersion;
    const theme = templateTheme[website.template];
    const galleryImageById = new Map(
      galleryImages.flatMap((image) =>
        image.publicUrl ? [[image.id, image] as const] : [],
      ),
    );
    const visibleArticles = articles.map((article) => ({
      ...article,
      summary: this.summary(article.content),
      content: this.cleanArticle(article.content),
      images: this.stringArray(article.galleryImageIds).flatMap((id) => {
        const image = galleryImageById.get(id);
        return image
          ? [
              {
                url: image.publicUrl,
                alt: image.fileName || profile.companyName,
              },
            ]
          : [];
      }),
    }));
    const inheritedRootByTenantId = new Map(
      inheritedRoots.map((binding) => [binding.tenantId, binding.hostname]),
    );
    const hostname = resolveContentSiteHostname(tenantId, {
      merchantHostname: merchantDomain?.hostname ?? null,
      agentRootHostname:
        tenant.parentId && tenant.parentId !== tenant.whiteLabelId
          ? (inheritedRootByTenantId.get(tenant.parentId) ?? null)
          : null,
      whiteLabelRootHostname: tenant.whiteLabelId
        ? (inheritedRootByTenantId.get(tenant.whiteLabelId) ?? null)
        : null,
      platformRootHostname,
    });
    const canonicalBase = hostname
      ? `https://${hostname}`
      : this.previewUrl(tenantId).replace(/\/index\.html$/, "");
    const siteQuestions = questions.map((question) => ({
      text: question.text,
      answer: `关于“${question.text}”，请结合本页公开服务资料与实际咨询情况确认。`,
    }));
    const data = {
      tenantId,
      templateId: theme.id,
      companyName: profile.companyName,
      industry: profile.industry,
      coreBusiness: profile.coreBusiness,
      introduction: profile.introduction,
      address: profile.address,
      phone: profile.phone,
      wechat: profile.wechat,
      businessHours: profile.businessHours,
      themeLabel: theme.label,
      accent: theme.accent,
      products: this.stringArray(profile.products).slice(0, 8),
      galleryImages: [
        ...new Map(
          visibleArticles
            .flatMap((article) => article.images)
            .map((image) => [image.url, image]),
        ).values(),
      ].slice(0, 6),
      articles: visibleArticles,
      questions: siteQuestions,
      description: this.description(
        profile.introduction,
        profile.coreBusiness,
        profile.companyName,
      ),
      jsonLd: JSON.stringify({
        "@context": "https://schema.org",
        "@type": profile.address ? "LocalBusiness" : "Organization",
        name: profile.companyName,
        description: this.description(
          profile.introduction,
          profile.coreBusiness,
          profile.companyName,
        ),
        telephone: profile.phone || undefined,
        address: profile.address || undefined,
      }).replace(/</g, "\\u003c"),
    };
    const navigation = {
      hasServices: data.products.length > 0,
      hasQuestions: siteQuestions.length > 0,
      hasAbout: Boolean(
        profile.introduction ||
          profile.coreBusiness ||
          profile.address ||
          profile.wechat ||
          profile.businessHours,
      ),
      navPrefix: "",
    };
    const generatedPaths = [
      "index.html",
      ...visibleArticles.map((article) => `articles/${article.id}.html`),
    ];
    if (navigation.hasServices) {
      generatedPaths.push("services.html");
      await this.write(
        directory,
        "services.html",
        this.renderHtml(
          withNavigation(infoPageTemplate),
          {
            ...data,
            ...navigation,
            pageType: "services",
            pageTitle: "服务项目",
            faqJsonLd: null,
          },
          canonicalBase,
          "services.html",
        ),
      );
    }
    if (navigation.hasQuestions) {
      generatedPaths.push("questions.html");
      const faqJsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: siteQuestions.map((item) => ({
          "@type": "Question",
          name: item.text,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }).replace(/</g, "\\u003c");
      await this.write(
        directory,
        "questions.html",
        this.renderHtml(
          withNavigation(infoPageTemplate),
          {
            ...data,
            ...navigation,
            pageType: "questions",
            pageTitle: "常见问题",
            faqJsonLd,
          },
          canonicalBase,
          "questions.html",
        ),
      );
    }
    if (navigation.hasAbout) {
      generatedPaths.push("about.html");
      await this.write(
        directory,
        "about.html",
        this.renderHtml(
          withNavigation(infoPageTemplate),
          {
            ...data,
            ...navigation,
            pageType: "about",
            pageTitle: "关于与联系",
            faqJsonLd: null,
          },
          canonicalBase,
          "about.html",
        ),
      );
    }
    await this.write(
      directory,
      "index.html",
      this.renderHtml(
        withNavigation(homeTemplate),
        { ...data, ...navigation },
        canonicalBase,
        "index.html",
      ),
    );
    await this.write(
      directory,
      "robots.txt",
      `User-agent: *\nAllow: /\nSitemap: ${canonicalBase}/sitemap.xml\n`,
    );
    await this.write(
      directory,
      "sitemap.xml",
      this.sitemap(generatedPaths, canonicalBase),
    );
    await Promise.all(
      visibleArticles.map((article) =>
        this.write(
          directory,
          join("articles", `${article.id}.html`),
          this.renderHtml(
            withNavigation(articleTemplate),
            { ...data, ...navigation, navPrefix: "../", article },
            canonicalBase,
            `articles/${article.id}.html`,
          ),
        ),
      ),
    );
    const sitePaths = [...generatedPaths, "robots.txt", "sitemap.xml"];
    const artifact = await stageStaticSiteArtifact(this.storage, {
      tenantId,
      version,
      directory,
      paths: sitePaths,
    });
    const generatedAt = new Date();
    const saved = await this.prisma.merchantWebsite.update({
      where: { tenantId },
      data: {
        hostname,
        status: WebsiteStatus.LOCAL_READY,
        lastGeneratedAt: generatedAt,
        version,
        profileVersionId: profileVersion.id,
        artifactObjectPrefix: artifact?.objectPrefix ?? null,
        artifactManifestUrl: artifact?.manifestUrl ?? null,
        artifactUploadedAt: artifact?.uploadedAt ?? null,
      },
    });
    return {
      ...saved,
      lastGeneratedAt: generatedAt,
      profileVersion: profileVersion.version,
      previewUrl: this.previewUrl(tenantId),
    };
  }

  async getPreview(
    tenantId: string,
    relativePath = "index.html",
  ): Promise<SiteFile> {
    if (
      !/^(?:index\.html|services\.html|questions\.html|about\.html|robots\.txt|sitemap\.xml|articles\/[a-zA-Z0-9_-]+\.html)$/.test(
        relativePath,
      )
    )
      throw new NotFoundException({
        code: "SITE_FILE_NOT_FOUND",
        message: "站点文件不存在",
      });
    const website = await this.prisma.merchantWebsite.findUnique({
      where: { tenantId },
    });
    if (
      !website ||
      (website.status !== WebsiteStatus.LOCAL_READY &&
        website.status !== WebsiteStatus.PUBLISHED)
    )
      throw new NotFoundException({
        code: "SITE_NOT_GENERATED",
        message: "站点尚未生成",
      });
    try {
      return {
        path: relativePath,
        content: await readFile(
          join(this.versionDirectory(tenantId, website.version), relativePath),
          "utf8",
        ),
      };
    } catch {
      throw new NotFoundException({
        code: "SITE_FILE_NOT_FOUND",
        message: "站点文件不存在",
      });
    }
  }

  async recordPhoneEvent(
    tenantId: string,
    input: { type?: unknown; page?: unknown; visitId?: unknown },
  ): Promise<void> {
    const type = input?.type;
    const page = typeof input?.page === "string" ? input.page.trim() : "";
    const visitId =
      typeof input?.visitId === "string" ? input.visitId.trim() : "";
    if (
      (type !== "phone_exposure" && type !== "phone_click") ||
      !/^\/api\/public\/sites\/[a-zA-Z0-9_-]+(?:\/(?:index\.html|services\.html|questions\.html|about\.html|articles\/[a-zA-Z0-9_-]+\.html))?$/.test(
        page,
      ) ||
      !/^[a-zA-Z0-9-]{16,80}$/.test(visitId)
    )
      throw new ConflictException({
        code: "SITE_EVENT_INVALID",
        message: "统计事件参数无效",
      });
    const website = await this.prisma.merchantWebsite.findUnique({
      where: { tenantId },
    });
    if (
      !website ||
      (website.status !== WebsiteStatus.LOCAL_READY &&
        website.status !== WebsiteStatus.PUBLISHED)
    )
      throw new NotFoundException({
        code: "SITE_NOT_GENERATED",
        message: "站点尚未生成",
      });
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { tenantId },
      select: { phone: true },
    });
    if (!profile?.phone.trim())
      throw new ConflictException({
        code: "SITE_PHONE_NOT_CONFIGURED",
        message: "未配置联系电话，不能记录电话统计",
      });
    const date = this.chinaDay(new Date());
    const visitorHash = createHash("sha256")
      .update(`${tenantId}:${visitId}`)
      .digest("hex");
    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.websitePhoneEvent.create({
          data: { tenantId, date, type, page, visitorHash },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          return;
        throw error;
      }
      await tx.websiteMetricDaily.upsert({
        where: { tenantId_date: { tenantId, date } },
        create: {
          tenantId,
          date,
          phoneExposureCount: type === "phone_exposure" ? 1 : 0,
          phoneClickCount: type === "phone_click" ? 1 : 0,
        },
        update:
          type === "phone_exposure"
            ? { phoneExposureCount: { increment: 1 } }
            : { phoneClickCount: { increment: 1 } },
      });
    });
  }

  previewUrl(tenantId: string): string {
    return `/api/public/sites/${encodeURIComponent(tenantId)}/index.html`;
  }

  private versionDirectory(tenantId: string, version: number): string {
    return join(siteRoot, tenantId, `v${version}`);
  }
  private renderHtml(
    template: string,
    data: object,
    canonicalBase: string,
    path: string,
  ): string {
    return renderer
      .renderString(template, data)
      .replace(
        "</head>",
        `<link rel="canonical" href="${this.escapeAttribute(`${canonicalBase}/${path}`)}"></head>`,
      );
  }
  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  private chinaDay(now: Date): Date {
    const china = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return new Date(
      Date.UTC(china.getUTCFullYear(), china.getUTCMonth(), china.getUTCDate()),
    );
  }
  private async write(
    directory: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    await writeFile(join(directory, relativePath), content, "utf8");
  }
  private cleanArticle(content: string): string {
    return sanitizeArticleContent(content);
  }
  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          )
          .map((item) => item.trim())
      : [];
  }
  private summary(content: string): string {
    return (
      sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} })
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160) || "企业内容文章"
    );
  }
  private description(
    introduction: string,
    business: string,
    company: string,
  ): string {
    return `${introduction || business || `${company} 企业服务信息`}`
      .replace(/\s+/g, " ")
      .slice(0, 160);
  }
  private sitemap(paths: string[], canonicalBase: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${this.escapeXml(`${canonicalBase}/${path}`)}</loc></url>`).join("")}</urlset>`;
  }
  private escapeXml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
