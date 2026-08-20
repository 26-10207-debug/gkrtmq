import { env } from "cloudflare:workers";

export type RuntimeEnv = {
  DB: D1Database;
  UPLOADS: R2Bucket;
  OPENAI_API_KEY?: string;
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?: string;
  AZURE_DOCUMENT_INTELLIGENCE_KEY?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export function getRuntimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

let initialization: Promise<void> | null = null;

export function ensureSchema() {
  if (initialization) return initialization;

  const { DB } = getRuntimeEnv();
  initialization = (async () => {
    await DB.batch([
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS auth_user (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          email_verified INTEGER NOT NULL DEFAULT 0,
          image TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS auth_session (
          id TEXT PRIMARY KEY,
          expires_at INTEGER NOT NULL,
          token TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS auth_account (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
          access_token TEXT,
          refresh_token TEXT,
          id_token TEXT,
          access_token_expires_at INTEGER,
          refresh_token_expires_at INTEGER,
          scope TEXT,
          password TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS auth_verification (
          id TEXT PRIMARY KEY,
          identifier TEXT NOT NULL,
          value TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER,
          updated_at INTEGER
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS reference_library (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          topic TEXT NOT NULL,
          source_name TEXT NOT NULL,
          source_url TEXT NOT NULL,
          license_note TEXT NOT NULL,
          access_mode TEXT NOT NULL,
          tags_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS contributions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          original_name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          object_key TEXT NOT NULL,
          source_note TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'uploaded',
          ai_model TEXT,
          learning_json TEXT,
          error_message TEXT,
          owner_id TEXT,
          owner_email TEXT,
          owner_display_name TEXT,
          view_count INTEGER NOT NULL DEFAULT 0,
          publish_mode TEXT NOT NULL DEFAULT 'instant',
          credits_awarded INTEGER NOT NULL DEFAULT 0,
          reviewed_at TEXT,
          mechanical_options TEXT NOT NULL DEFAULT '{}',
          mechanical_status TEXT NOT NULL DEFAULT 'none',
          extracted_text TEXT,
          questions_json TEXT,
          recall_json TEXT,
          text_only INTEGER NOT NULL DEFAULT 0,
          mechanical_error TEXT,
          custom_materials_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          display_name TEXT NOT NULL,
          credit_balance INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS credit_ledger (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          reason TEXT NOT NULL,
          contribution_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS learning_progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          learner_id TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          mode TEXT NOT NULL,
          completed_items INTEGER NOT NULL DEFAULT 0,
          score INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (learner_id, asset_id, mode)
        )
      `),
    ]);

    const columnResult = await DB.prepare("PRAGMA table_info(contributions)").all();
    const columns = new Set(
      columnResult.results.map((row) => String((row as { name?: unknown }).name ?? "")),
    );
    const additions: D1PreparedStatement[] = [];
    if (!columns.has("owner_id")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN owner_id TEXT"));
    if (!columns.has("owner_email")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN owner_email TEXT"));
    if (!columns.has("owner_display_name")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN owner_display_name TEXT"));
    if (!columns.has("view_count")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0"));
    if (!columns.has("publish_mode")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN publish_mode TEXT NOT NULL DEFAULT 'instant'"));
    if (!columns.has("credits_awarded")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN credits_awarded INTEGER NOT NULL DEFAULT 0"));
    if (!columns.has("reviewed_at")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN reviewed_at TEXT"));
    if (!columns.has("mechanical_options")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN mechanical_options TEXT NOT NULL DEFAULT '{}'"));
    if (!columns.has("mechanical_status")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN mechanical_status TEXT NOT NULL DEFAULT 'none'"));
    if (!columns.has("extracted_text")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN extracted_text TEXT"));
    if (!columns.has("questions_json")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN questions_json TEXT"));
    if (!columns.has("recall_json")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN recall_json TEXT"));
    if (!columns.has("text_only")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN text_only INTEGER NOT NULL DEFAULT 0"));
    if (!columns.has("mechanical_error")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN mechanical_error TEXT"));
    if (!columns.has("custom_materials_json")) additions.push(DB.prepare("ALTER TABLE contributions ADD COLUMN custom_materials_json TEXT NOT NULL DEFAULT '{}'"));
    if (additions.length) await DB.batch(additions);

    const userColumnResult = await DB.prepare("PRAGMA table_info(users)").all();
    const userColumns = new Set(
      userColumnResult.results.map((row) => String((row as { name?: unknown }).name ?? "")),
    );
    if (!userColumns.has("credit_balance")) {
      await DB.prepare("ALTER TABLE users ADD COLUMN credit_balance INTEGER NOT NULL DEFAULT 0").run();
    }

    await DB.batch([
      DB.prepare("CREATE INDEX IF NOT EXISTS auth_session_user_idx ON auth_session (user_id)"),
      DB.prepare("CREATE INDEX IF NOT EXISTS auth_account_user_idx ON auth_account (user_id)"),
      DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS auth_account_provider_unique_idx ON auth_account (provider_id, account_id)"),
      DB.prepare("CREATE INDEX IF NOT EXISTS auth_verification_identifier_idx ON auth_verification (identifier)"),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS contributions_status_created_idx
        ON contributions (status, created_at DESC)
      `),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS contributions_owner_created_idx
        ON contributions (owner_id, created_at DESC)
      `),
      DB.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_contribution_unique_idx
        ON credit_ledger (contribution_id)
        WHERE contribution_id IS NOT NULL
      `),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx
        ON credit_ledger (user_id, created_at DESC)
      `),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS learning_progress_learner_idx
        ON learning_progress (learner_id, updated_at DESC)
      `),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS reference_library_topic_idx
        ON reference_library (topic, updated_at DESC)
      `),
      DB.prepare(`
        CREATE INDEX IF NOT EXISTS reference_library_source_idx
        ON reference_library (source_name)
      `),
    ]);

    const referenceSeeds = [
      {
        id: "nist-core-constants",
        title: "NIST CODATA 핵심 상수 — 빛의 속력과 플랑크 상수",
        description: "빛의 속력 c = 299,792,458 m/s와 플랑크 상수 h = 6.62607015×10⁻³⁴ J·s처럼 SI에서 정확히 정의된 상수를 확인하고, 단위·유효숫자 문제에 활용합니다.",
        topic: "물리학 · 측정과 상수",
        sourceName: "NIST CODATA",
        sourceUrl: "https://physics.nist.gov/cgi-bin/cuu/CCValue?uhz%7CShowFirst=Browse",
        licenseNote: "NIST 원문·데이터의 최신 값과 이용 조건은 출처에서 다시 확인하세요. 이 DB에는 학습용 요약과 출처 링크만 보관합니다.",
        accessMode: "structured_reference",
        tags: ["공식 데이터", "SI", "상수", "출처 확인"],
      },
      {
        id: "wikidata-physics-graph",
        title: "Wikidata로 잇는 물리 개념 연결 지도",
        description: "힘·돌림힘·에너지·파동처럼 서로 연결된 개념을 Wikidata의 공개 식별자와 관계로 탐색하는 참고 자료입니다. 검색어를 넓히고 관련 개념을 찾는 데 활용하세요.",
        topic: "물리학 · 개념 탐색",
        sourceName: "Wikidata",
        sourceUrl: "https://www.wikidata.org/wiki/Wikidata:Text_of_the_Creative_Commons_Public_Domain_Dedication",
        licenseNote: "Wikidata 구조화 데이터는 CC0 공개헌신으로 제공됩니다. 개별 출처의 이미지·설명문은 별도 권리가 있을 수 있으므로 원문 페이지에서 확인하세요.",
        accessMode: "structured_reference",
        tags: ["CC0", "개념 연결", "식별자", "탐색"],
      },
      {
        id: "nasa-science-media",
        title: "NASA 과학 데이터·시각 자료 출처 안내",
        description: "우주·지구·태양계 학습에 쓸 공개 NASA 데이터와 시각 자료의 출처를 찾는 안내입니다. 자료의 과학적 맥락과 크레딧 표기를 함께 확인합니다.",
        topic: "물리학 · 우주와 관측",
        sourceName: "NASA",
        sourceUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
        licenseNote: "NASA 로고·휘장 사용은 금지되며, 제3자 저작권 표기가 있는 자료는 별도 허가가 필요할 수 있습니다. NASA의 후원·보증처럼 보이게 사용하지 마세요.",
        accessMode: "structured_reference",
        tags: ["공식 출처", "우주", "이미지", "이용 조건"],
      },
      {
        id: "openstax-university-physics-1",
        title: "OpenStax 대학물리학 1권 — 외부 학습 링크",
        description: "역학·파동·열을 단계적으로 다루는 공개 교재의 원문으로 이동합니다. 이 앱에는 교재 본문을 저장하지 않고 외부 출처만 연결합니다.",
        topic: "물리학 · 교과 학습",
        sourceName: "OpenStax",
        sourceUrl: "https://openstax.org/books/university-physics-volume-1/pages/1-introduction",
        licenseNote: "원문을 복제하거나 유료 서비스에 포함하기 전에는 해당 판본·페이지의 라이선스를 직접 확인해야 합니다.",
        accessMode: "external_link",
        tags: ["외부 학습 자료", "교재", "라이선스 확인"],
      },
      {
        id: "phet-physics-simulations",
        title: "PhET 물리 시뮬레이션 — 외부 학습 링크",
        description: "직접 조작으로 힘·에너지·파동을 탐구할 수 있는 PhET 시뮬레이션 목록으로 이동합니다. 수업 또는 개인 학습에서 예시를 확인할 때 사용하세요.",
        topic: "물리학 · 시뮬레이션",
        sourceName: "PhET Interactive Simulations",
        sourceUrl: "https://phet.colorado.edu/en/simulations",
        licenseNote: "이 앱은 PhET 시뮬레이션을 복제·재배포하지 않고 링크만 제공합니다. 유료·상업적 사용 전에는 현재 라이선스와 사용 조건을 확인해야 합니다.",
        accessMode: "external_link",
        tags: ["외부 학습 자료", "시뮬레이션", "라이선스 확인"],
      },
    ];
    await DB.batch(referenceSeeds.map((reference) => DB.prepare(`
      INSERT OR IGNORE INTO reference_library
        (id, title, description, topic, source_name, source_url, license_note, access_mode, tags_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reference.id,
      reference.title,
      reference.description,
      reference.topic,
      reference.sourceName,
      reference.sourceUrl,
      reference.licenseNote,
      reference.accessMode,
      JSON.stringify(reference.tags),
    )));
    await DB.prepare("PRAGMA optimize").run();
  })();

  return initialization;
}
