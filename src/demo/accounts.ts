// DEMO 전용 고정 데이터. 실제 매장/직원/식품안전 기준이 아니다.
// 시드 스크립트(scripts/seed-demo.ts)와 로그인 화면의 데모 계정 목록이 함께 사용한다.
import type { AppRole } from "@/domain/enums";

export const DEMO_IDS = {
  organization: "00000000-0000-4000-8000-000000000001",
  brandKodo: "00000000-0000-4000-8000-0000000000b1",
  brandOther: "00000000-0000-4000-8000-0000000000b2",
  storeMakati: "00000000-0000-4000-8000-0000000000c1",
  storeBgc: "00000000-0000-4000-8000-0000000000c2",
  storeOther: "00000000-0000-4000-8000-0000000000c3",
  manualGalbi: "00000000-0000-4000-8000-0000000000d1",
  draftGalbi: "00000000-0000-4000-8000-0000000000d2",
  submissionGuided: "00000000-0000-4000-8000-0000000000e1",
} as const;

export interface DemoAccount {
  email: string;
  name: string;
  role: AppRole;
  brand: "kodo" | "other" | null;
  store: "makati" | "bgc" | "other" | null;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "field.makati@example.com", name: "DEMO Field Staff (Makati)", role: "field_staff", brand: "kodo", store: "makati" },
  { email: "field.bgc@example.com", name: "DEMO Field Staff (BGC)", role: "field_staff", brand: "kodo", store: "bgc" },
  { email: "manager.makati@example.com", name: "DEMO Store Manager (Makati)", role: "store_manager", brand: "kodo", store: "makati" },
  { email: "editor@example.com", name: "DEMO HQ Editor", role: "hq_editor", brand: "kodo", store: null },
  { email: "approver@example.com", name: "DEMO HQ Approver", role: "hq_approver", brand: "kodo", store: null },
  { email: "admin@example.com", name: "DEMO System Admin", role: "system_admin", brand: null, store: null },
  { email: "field.other@example.com", name: "DEMO Field Staff (Other Brand)", role: "field_staff", brand: "other", store: "other" },
];
