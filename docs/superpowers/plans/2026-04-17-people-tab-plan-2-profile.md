# People Tab — Plan 2: Profile Screen + Interaction Timeline + Log Interaction Sheet

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Person Profile screen (`/people/[id].tsx`) with a "Talk about next time" topic section, inline notes editing, a chronological interaction timeline, and a `LogInteractionSheet` bottom sheet that lets users record calls, coffees, texts, etc. — wired to the QuickActionSheet "Log a chat" action.

**Architecture:** A new `useInteractionsStore` (Zustand, `db`-as-first-arg pattern matching `usePeopleStore`) manages interactions + next-topics per contact in a `byContactId` map. A companion `useInteractionsData(contactId)` hook wires db automatically. `LogInteractionSheet` follows the iOS SwiftUI `BottomSheet` / Android `ModalBottomSheet` split used throughout the app, controlled by a lightweight `useLogInteractionSheetStore`. The profile screen is a push-navigation Stack screen inside the existing `people/_layout.tsx` Stack.

**Tech Stack:** Zustand, Drizzle ORM (`desc`, `eq`), expo-router (`useLocalSearchParams`), `@expo/ui/swift-ui` (BottomSheet), `@expo/ui/jetpack-compose` (ModalBottomSheet), heroui-native (Button, Chip), phosphor-react-native, uniwind (Tailwind v4)

---

## File Map

**Create:**
- `apps/mobile/src/stores/useInteractionsStore.ts` — Zustand store for interactions + next-topics CRUD, keyed by contactId
- `apps/mobile/src/stores/__tests__/useInteractionsStore.test.ts` — unit tests
- `apps/mobile/src/stores/useLogInteractionSheetStore.ts` — open/close + optional prefill contactId
- `apps/mobile/src/hooks/useInteractionsData.ts` — db-forwarding hook wrapping useInteractionsStore
- `apps/mobile/src/components/atoms/TopicChip/TopicChip.tsx` — tappable chip (done/undone toggle + remove)
- `apps/mobile/src/components/atoms/TopicChip/index.ts`
- `apps/mobile/src/components/molecules/InteractionEntry/InteractionEntry.tsx` — timeline row (icon, date, note)
- `apps/mobile/src/components/molecules/InteractionEntry/index.ts`
- `apps/mobile/src/components/organisms/LogInteractionSheet/LogInteractionSheet.ios.tsx`
- `apps/mobile/src/components/organisms/LogInteractionSheet/LogInteractionSheet.android.tsx`
- `apps/mobile/src/components/organisms/LogInteractionSheet/index.ts`
- `apps/mobile/src/app/(main)/(tabs)/people/[id].tsx` — profile screen

**Modify:**
- `apps/mobile/src/stores/usePeopleStore.ts` — add `patchContactMeta` (in-memory only, no DB write)
- `apps/mobile/src/app/(main)/(tabs)/_layout.tsx` — mount `<LogInteractionSheet />` in both branches
- `apps/mobile/src/components/organisms/QuickActionSheet/QuickActionSheet.ios.tsx` — wire "Log a chat"
- `apps/mobile/src/components/organisms/QuickActionSheet/QuickActionSheet.android.tsx` — wire "Log a chat"

---

## Task 1: Add `patchContactMeta` to `usePeopleStore`

**Files:**
- Modify: `apps/mobile/src/stores/usePeopleStore.ts`

`lastInteractionAt` and `lastInteractionType` on `Contact` are derived fields (not in the contacts table). `useInteractionsStore` will call this after loading or adding an interaction to keep the people list's warmth display current.

- [ ] **Step 1: Add `patchContactMeta` to the store interface and implementation**

Open `apps/mobile/src/stores/usePeopleStore.ts`. Add to `PeopleState` interface (after `getContactById`):

```ts
patchContactMeta: (
  id: string,
  meta: { lastInteractionAt: string; lastInteractionType: Interaction["type"] },
) => void;
```

Add to the `create` call body (after `getContactById`):

```ts
patchContactMeta: (id, meta) =>
  set((state) => ({
    contacts: state.contacts.map((c) =>
      c.id === id
        ? { ...c, lastInteractionAt: meta.lastInteractionAt, lastInteractionType: meta.lastInteractionType }
        : c,
    ),
  })),
```

Also add `Interaction` to the type import at line 5:

```ts
import type { Contact, Interaction } from "../types";
```

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
cd apps/mobile
npx jest --testPathPattern="usePeopleStore" --no-coverage
```

Expected: `4 passed`

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/stores/usePeopleStore.ts
git commit -m "feat(people): add patchContactMeta to usePeopleStore for derived interaction fields"
```

---

## Task 2: `useInteractionsStore` + unit tests

**Files:**
- Create: `apps/mobile/src/stores/useInteractionsStore.ts`
- Create: `apps/mobile/src/stores/__tests__/useInteractionsStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/stores/__tests__/useInteractionsStore.test.ts`:

```ts
import { useInteractionsStore } from "../useInteractionsStore";
import { usePeopleStore } from "../usePeopleStore";
import type { Database } from "../../db/client";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const iRows: Row[] = [];  // interaction rows
  const tRows: Row[] = [];  // topic rows

  const db = {
    insert: (_table: unknown) => ({
      values: async (v: Row) => {
        if ("type" in v && "contactId" in v) iRows.push({ ...v });
        else tRows.push({ ...v });
      },
    }),
    update: (_table: unknown) => ({
      set: (patch: Row) => ({
        where: async () => {
          const rows = "isDone" in patch ? tRows : iRows;
          if (rows[0]) Object.assign(rows[0], patch);
        },
      }),
    }),
    delete: (_table: unknown) => ({
      where: async () => {
        iRows.length = 0;
        tRows.length = 0;
      },
    }),
    select: () => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          orderBy: async () => [],
        }),
      }),
    }),
  } as unknown as Database;

  return { db, iRows, tRows };
}

function resetAll() {
  useInteractionsStore.setState({ byContactId: {} });
  usePeopleStore.setState({ contacts: [], isLoaded: false });
}

describe("useInteractionsStore", () => {
  beforeEach(resetAll);

  it("addInteraction inserts row and prepends to state", async () => {
    const { db, iRows } = makeFakeDb();

    const result = await useInteractionsStore.getState().addInteraction(db, {
      contactId: "c1",
      type: "call",
      note: "quick catch-up",
    });

    expect(result.id).toBeTruthy();
    expect(result.type).toBe("call");
    expect(iRows).toHaveLength(1);
    expect(iRows[0]).toMatchObject({ contactId: "c1", type: "call" });

    const state = useInteractionsStore.getState().byContactId["c1"];
    expect(state?.interactions).toHaveLength(1);
    expect(state?.interactions[0]?.note).toBe("quick catch-up");
  });

  it("addInteraction calls patchContactMeta on people store", async () => {
    const { db } = makeFakeDb();
    // Seed a contact in people store
    usePeopleStore.setState({
      contacts: [
        { id: "c1", name: "Maria", nudgeFrequencyDays: 14, source: "manual", createdAt: "2025-01-01", updatedAt: "2025-01-01" },
      ],
      isLoaded: true,
    });

    await useInteractionsStore.getState().addInteraction(db, {
      contactId: "c1",
      type: "coffee",
    });

    const contact = usePeopleStore.getState().contacts[0]!;
    expect(contact.lastInteractionAt).toBeTruthy();
    expect(contact.lastInteractionType).toBe("coffee");
  });

  it("removeInteraction removes from state", async () => {
    const { db } = makeFakeDb();
    const i = await useInteractionsStore.getState().addInteraction(db, {
      contactId: "c1",
      type: "text",
    });

    await useInteractionsStore.getState().removeInteraction(db, i.id, "c1");

    const state = useInteractionsStore.getState().byContactId["c1"];
    expect(state?.interactions).toHaveLength(0);
  });

  it("addTopic inserts row and appends to state", async () => {
    const { db, tRows } = makeFakeDb();

    const topic = await useInteractionsStore.getState().addTopic(db, {
      contactId: "c1",
      topic: "ask about new job",
    });

    expect(topic.id).toBeTruthy();
    expect(topic.isDone).toBe(false);
    expect(tRows).toHaveLength(1);

    const state = useInteractionsStore.getState().byContactId["c1"];
    expect(state?.topics[0]?.topic).toBe("ask about new job");
  });

  it("toggleTopicDone flips isDone in state", async () => {
    const { db } = makeFakeDb();
    const topic = await useInteractionsStore.getState().addTopic(db, {
      contactId: "c1",
      topic: "ask about new job",
    });

    await useInteractionsStore.getState().toggleTopicDone(db, topic.id, "c1", true);

    const updated = useInteractionsStore.getState().byContactId["c1"]?.topics[0];
    expect(updated?.isDone).toBe(true);
  });

  it("removeTopic removes from state", async () => {
    const { db } = makeFakeDb();
    const topic = await useInteractionsStore.getState().addTopic(db, {
      contactId: "c1",
      topic: "ask about new job",
    });

    await useInteractionsStore.getState().removeTopic(db, topic.id, "c1");

    const state = useInteractionsStore.getState().byContactId["c1"];
    expect(state?.topics).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/mobile
npx jest --testPathPattern="useInteractionsStore" --no-coverage
```

Expected: FAIL with "Cannot find module '../useInteractionsStore'"

- [ ] **Step 3: Implement `useInteractionsStore`**

Create `apps/mobile/src/stores/useInteractionsStore.ts`:

```ts
import { create } from "zustand";
import { eq, desc } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  interactions as interactionsTable,
  nextTopics as nextTopicsTable,
} from "../db/schema";
import type { Interaction, NextTopic } from "../types";
import { usePeopleStore } from "./usePeopleStore";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToInteraction(row: typeof interactionsTable.$inferSelect): Interaction {
  return {
    id: row.id,
    contactId: row.contactId,
    type: row.type,
    note: row.note ?? undefined,
    aiSummary: row.aiSummary ?? undefined,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

function rowToTopic(row: typeof nextTopicsTable.$inferSelect): NextTopic {
  return {
    id: row.id,
    contactId: row.contactId,
    topic: row.topic,
    isDone: row.isDone === 1,
    createdAt: row.createdAt,
  };
}

export type AddInteractionInput = {
  contactId: string;
  type: Interaction["type"];
  note?: string;
  occurredAt?: string; // ISO string, defaults to now
};

export type AddTopicInput = {
  contactId: string;
  topic: string;
};

interface ContactData {
  interactions: Interaction[];
  topics: NextTopic[];
  isLoaded: boolean;
}

interface InteractionsState {
  byContactId: Record<string, ContactData>;
  loadForContact: (db: Database, contactId: string) => Promise<void>;
  addInteraction: (db: Database, input: AddInteractionInput) => Promise<Interaction>;
  removeInteraction: (db: Database, id: string, contactId: string) => Promise<void>;
  addTopic: (db: Database, input: AddTopicInput) => Promise<NextTopic>;
  toggleTopicDone: (db: Database, id: string, contactId: string, isDone: boolean) => Promise<void>;
  removeTopic: (db: Database, id: string, contactId: string) => Promise<void>;
  getInteractionsFor: (contactId: string) => Interaction[];
  getTopicsFor: (contactId: string) => NextTopic[];
}

export const useInteractionsStore = create<InteractionsState>((set, get) => ({
  byContactId: {},

  loadForContact: async (db, contactId) => {
    const [iRows, tRows] = await Promise.all([
      db
        .select()
        .from(interactionsTable)
        .where(eq(interactionsTable.contactId, contactId))
        .orderBy(desc(interactionsTable.occurredAt)),
      db
        .select()
        .from(nextTopicsTable)
        .where(eq(nextTopicsTable.contactId, contactId)),
    ]);
    const interactions = iRows.map(rowToInteraction);
    const topics = tRows.map(rowToTopic);
    set((s) => ({
      byContactId: {
        ...s.byContactId,
        [contactId]: { interactions, topics, isLoaded: true },
      },
    }));
    if (interactions.length > 0) {
      const latest = interactions[0]!;
      usePeopleStore.getState().patchContactMeta(contactId, {
        lastInteractionAt: latest.occurredAt,
        lastInteractionType: latest.type,
      });
    }
  },

  addInteraction: async (db, input) => {
    const now = new Date().toISOString();
    const interaction: Interaction = {
      id: generateId(),
      contactId: input.contactId,
      type: input.type,
      note: input.note,
      occurredAt: input.occurredAt ?? now,
      createdAt: now,
    };
    await db.insert(interactionsTable).values({
      id: interaction.id,
      contactId: interaction.contactId,
      type: interaction.type,
      note: interaction.note ?? null,
      occurredAt: interaction.occurredAt,
    });
    set((s) => {
      const prev = s.byContactId[input.contactId] ?? {
        interactions: [],
        topics: [],
        isLoaded: true,
      };
      return {
        byContactId: {
          ...s.byContactId,
          [input.contactId]: {
            ...prev,
            interactions: [interaction, ...prev.interactions],
          },
        },
      };
    });
    usePeopleStore.getState().patchContactMeta(input.contactId, {
      lastInteractionAt: interaction.occurredAt,
      lastInteractionType: interaction.type,
    });
    return interaction;
  },

  removeInteraction: async (db, id, contactId) => {
    await db.delete(interactionsTable).where(eq(interactionsTable.id, id));
    set((s) => {
      const prev = s.byContactId[contactId];
      if (!prev) return s;
      return {
        byContactId: {
          ...s.byContactId,
          [contactId]: {
            ...prev,
            interactions: prev.interactions.filter((i) => i.id !== id),
          },
        },
      };
    });
  },

  addTopic: async (db, input) => {
    const now = new Date().toISOString();
    const topic: NextTopic = {
      id: generateId(),
      contactId: input.contactId,
      topic: input.topic,
      isDone: false,
      createdAt: now,
    };
    await db.insert(nextTopicsTable).values({
      id: topic.id,
      contactId: topic.contactId,
      topic: topic.topic,
      isDone: 0,
    });
    set((s) => {
      const prev = s.byContactId[input.contactId] ?? {
        interactions: [],
        topics: [],
        isLoaded: true,
      };
      return {
        byContactId: {
          ...s.byContactId,
          [input.contactId]: { ...prev, topics: [...prev.topics, topic] },
        },
      };
    });
    return topic;
  },

  toggleTopicDone: async (db, id, contactId, isDone) => {
    await db
      .update(nextTopicsTable)
      .set({ isDone: isDone ? 1 : 0 })
      .where(eq(nextTopicsTable.id, id));
    set((s) => {
      const prev = s.byContactId[contactId];
      if (!prev) return s;
      return {
        byContactId: {
          ...s.byContactId,
          [contactId]: {
            ...prev,
            topics: prev.topics.map((t) =>
              t.id === id ? { ...t, isDone } : t,
            ),
          },
        },
      };
    });
  },

  removeTopic: async (db, id, contactId) => {
    await db.delete(nextTopicsTable).where(eq(nextTopicsTable.id, id));
    set((s) => {
      const prev = s.byContactId[contactId];
      if (!prev) return s;
      return {
        byContactId: {
          ...s.byContactId,
          [contactId]: {
            ...prev,
            topics: prev.topics.filter((t) => t.id !== id),
          },
        },
      };
    });
  },

  getInteractionsFor: (contactId) =>
    get().byContactId[contactId]?.interactions ?? [],

  getTopicsFor: (contactId) =>
    get().byContactId[contactId]?.topics ?? [],
}));
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/mobile
npx jest --testPathPattern="useInteractionsStore" --no-coverage
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/stores/useInteractionsStore.ts \
        apps/mobile/src/stores/__tests__/useInteractionsStore.test.ts
git commit -m "feat(people): add useInteractionsStore with interactions + topics CRUD"
```

---

## Task 3: `useInteractionsData` hook

**Files:**
- Create: `apps/mobile/src/hooks/useInteractionsData.ts`

- [ ] **Step 1: Implement the hook**

Create `apps/mobile/src/hooks/useInteractionsData.ts`:

```ts
import { useEffect } from "react";
import { useDatabase } from "./useDatabase";
import {
  useInteractionsStore,
  type AddInteractionInput,
} from "../stores/useInteractionsStore";

export function useInteractionsData(contactId: string) {
  const { db, isReady } = useDatabase();
  const contactData = useInteractionsStore((s) => s.byContactId[contactId]);
  const store = useInteractionsStore();

  useEffect(() => {
    if (isReady && db && !contactData?.isLoaded) {
      void store.loadForContact(db, contactId);
    }
  }, [isReady, db, contactId, contactData?.isLoaded]);

  return {
    isLoaded: contactData?.isLoaded ?? false,
    interactions: contactData?.interactions ?? [],
    topics: contactData?.topics ?? [],
    addInteraction: (input: Omit<AddInteractionInput, "contactId">) =>
      db
        ? store.addInteraction(db, { ...input, contactId })
        : Promise.resolve(undefined as unknown as import("../types").Interaction),
    removeInteraction: (id: string) =>
      db ? store.removeInteraction(db, id, contactId) : Promise.resolve(),
    addTopic: (topic: string) =>
      db
        ? store.addTopic(db, { contactId, topic })
        : Promise.resolve(undefined as unknown as import("../types").NextTopic),
    toggleTopicDone: (id: string, isDone: boolean) =>
      db ? store.toggleTopicDone(db, id, contactId, isDone) : Promise.resolve(),
    removeTopic: (id: string) =>
      db ? store.removeTopic(db, id, contactId) : Promise.resolve(),
  };
}
```

- [ ] **Step 2: Type-check to confirm no errors**

```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | grep "useInteractionsData"
```

Expected: no output (no errors in that file)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/useInteractionsData.ts
git commit -m "feat(people): add useInteractionsData hook wiring db to interactions store"
```

---

## Task 4: `TopicChip` atom + `InteractionEntry` molecule

**Files:**
- Create: `apps/mobile/src/components/atoms/TopicChip/TopicChip.tsx`
- Create: `apps/mobile/src/components/atoms/TopicChip/index.ts`
- Create: `apps/mobile/src/components/molecules/InteractionEntry/InteractionEntry.tsx`
- Create: `apps/mobile/src/components/molecules/InteractionEntry/index.ts`

- [ ] **Step 1: Create `TopicChip`**

Create `apps/mobile/src/components/atoms/TopicChip/TopicChip.tsx`:

```tsx
import { Pressable, View } from "react-native";
import { Check, X } from "phosphor-react-native";
import { useCSSVariable } from "uniwind";
import { AppText } from "@/components/atoms/Text";
import type { NextTopic } from "@/types";

interface TopicChipProps {
  topic: NextTopic;
  onToggle: () => void;
  onRemove?: () => void;
}

export const TopicChip = ({ topic, onToggle, onRemove }: TopicChipProps) => {
  const [primaryColor, mutedColor] = useCSSVariable([
    "--color-primary",
    "--color-muted",
  ]);

  return (
    <View
      className={`flex-row items-center gap-1 rounded-full border px-3 py-1.5 ${
        topic.isDone
          ? "border-muted/40 bg-muted/10"
          : "border-primary/40 bg-primary/10"
      }`}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: topic.isDone }}
        className="flex-row items-center gap-1.5"
      >
        {topic.isDone && (
          <Check size={11} weight="bold" color={mutedColor as string} />
        )}
        <AppText
          size="xs"
          weight="medium"
          color={topic.isDone ? "muted" : "primary"}
          style={topic.isDone ? { textDecorationLine: "line-through" } : undefined}
        >
          {topic.topic}
        </AppText>
      </Pressable>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove topic">
          <X size={10} weight="bold" color={mutedColor as string} />
        </Pressable>
      )}
    </View>
  );
};
```

Create `apps/mobile/src/components/atoms/TopicChip/index.ts`:

```ts
export { TopicChip } from "./TopicChip";
```

- [ ] **Step 2: Create `InteractionEntry`**

Create `apps/mobile/src/components/molecules/InteractionEntry/InteractionEntry.tsx`:

```tsx
import { View } from "react-native";
import {
  Phone,
  Coffee,
  ChatCircle,
  Microphone,
  HandWaving,
} from "phosphor-react-native";
import { useCSSVariable } from "uniwind";
import { AppText } from "@/components/atoms/Text";
import type { Interaction } from "@/types";
import type { Icon as PhosphorIcon } from "phosphor-react-native";

const TYPE_ICON: Record<Interaction["type"], PhosphorIcon> = {
  call: Phone,
  coffee: Coffee,
  text: ChatCircle,
  voicenote: Microphone,
  other: HandWaving,
};

const TYPE_LABEL: Record<Interaction["type"], string> = {
  call: "Call",
  coffee: "Coffee",
  text: "Text",
  voicenote: "Voice note",
  other: "Hangout",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface InteractionEntryProps {
  interaction: Interaction;
}

export const InteractionEntry = ({ interaction }: InteractionEntryProps) => {
  const [mutedColor, primaryColor] = useCSSVariable([
    "--color-muted",
    "--color-primary",
  ]);
  const Icon = TYPE_ICON[interaction.type];

  return (
    <View className="flex-row gap-3 py-3">
      <View className="w-14 items-center gap-1">
        <Icon size={16} weight="fill" color={mutedColor as string} />
        <AppText size="xs" color="muted">
          {formatDate(interaction.occurredAt)}
        </AppText>
      </View>
      <View className="flex-1 gap-0.5">
        <AppText size="sm" weight="medium">
          {TYPE_LABEL[interaction.type]}
        </AppText>
        {interaction.note ? (
          <AppText size="xs" color="muted" numberOfLines={2}>
            {interaction.note}
          </AppText>
        ) : null}
        {interaction.aiSummary ? (
          <View className="mt-1 rounded-md bg-primary/10 px-2 py-1">
            <AppText size="xs" color="primary" numberOfLines={2}>
              {interaction.aiSummary}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
};
```

Create `apps/mobile/src/components/molecules/InteractionEntry/index.ts`:

```ts
export { InteractionEntry } from "./InteractionEntry";
```

- [ ] **Step 3: Type-check**

```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | grep -E "(TopicChip|InteractionEntry)"
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/atoms/TopicChip/ \
        apps/mobile/src/components/molecules/InteractionEntry/
git commit -m "feat(people): add TopicChip atom + InteractionEntry molecule"
```

---

## Task 5: `useLogInteractionSheetStore` + `LogInteractionSheet` (iOS + Android)

**Files:**
- Create: `apps/mobile/src/stores/useLogInteractionSheetStore.ts`
- Create: `apps/mobile/src/components/organisms/LogInteractionSheet/LogInteractionSheet.ios.tsx`
- Create: `apps/mobile/src/components/organisms/LogInteractionSheet/LogInteractionSheet.android.tsx`
- Create: `apps/mobile/src/components/organisms/LogInteractionSheet/index.ts`

- [ ] **Step 1: Create the store**

Create `apps/mobile/src/stores/useLogInteractionSheetStore.ts`:

```ts
import { create } from "zustand";

interface LogInteractionSheetState {
  isOpen: boolean;
  prefillContactId: string | null;
  open: (contactId?: string) => void;
  close: () => void;
}

export const useLogInteractionSheetStore = create<LogInteractionSheetState>(
  (set) => ({
    isOpen: false,
    prefillContactId: null,
    open: (contactId) =>
      set({ isOpen: true, prefillContactId: contactId ?? null }),
    close: () => set({ isOpen: false, prefillContactId: null }),
  }),
);
```

- [ ] **Step 2: Create iOS sheet**

Create `apps/mobile/src/components/organisms/LogInteractionSheet/LogInteractionSheet.ios.tsx`:

```tsx
import { useState } from "react";
import { View, ScrollView, TextInput } from "react-native";
import {
  BottomSheet,
  Group,
  Host,
  RNHostView,
} from "@expo/ui/swift-ui";
import {
  presentationDetents,
  presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { AppText } from "@/components/atoms/Text";
import { Button, Chip } from "heroui-native";
import { useCSSVariable } from "uniwind";
import { useLogInteractionSheetStore } from "@/stores/useLogInteractionSheetStore";
import { useInteractionsStore } from "@/stores/useInteractionsStore";
import { usePeopleData } from "@/hooks/usePeopleData";
import { useDatabase } from "@/hooks/useDatabase";
import type { Interaction } from "@/types";

const INTERACTION_TYPES: { value: Interaction["type"]; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "coffee", label: "Coffee" },
  { value: "text", label: "Text" },
  { value: "voicenote", label: "Voice Note" },
  { value: "other", label: "Other" },
];

const DATE_OPTIONS = [
  { label: "Today", offset: 0 },
  { label: "Yesterday", offset: 1 },
] as const;

function isoFromOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export const LogInteractionSheet = () => {
  const { isOpen, prefillContactId, close } = useLogInteractionSheetStore();
  const { contacts } = usePeopleData();
  const { db } = useDatabase();
  const store = useInteractionsStore();

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [type, setType] = useState<Interaction["type"]>("call");
  const [dateOffset, setDateOffset] = useState(0);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [mutedColor] = useCSSVariable(["--color-muted"]);

  const activeContactId = prefillContactId ?? selectedContactId;
  const activeContact = contacts.find((c) => c.id === activeContactId);

  const handleClose = () => {
    close();
    setSelectedContactId(null);
    setType("call");
    setDateOffset(0);
    setNote("");
    setIsSaving(false);
  };

  const handleSave = async () => {
    if (!activeContactId || !db) return;
    setIsSaving(true);
    try {
      await store.addInteraction(db, {
        contactId: activeContactId,
        type,
        note: note.trim() || undefined,
        occurredAt: isoFromOffset(dateOffset),
      });
    } finally {
      setIsSaving(false);
    }
    handleClose();
  };

  return (
    <Host style={{ position: "absolute", width: 0, height: 0 }}>
      <BottomSheet
        isPresented={isOpen}
        onIsPresentedChange={(presented) => {
          if (!presented) handleClose();
        }}
      >
        <Group
          modifiers={[
            presentationDetents(["large"]),
            presentationDragIndicator("visible"),
          ]}
        >
          <RNHostView>
            <View className="px-5 py-6 gap-5">
              <AppText size="xl" weight="bold" family="headline">
                Log Interaction
              </AppText>

              {/* Contact picker — only when not prefilled from profile */}
              {!prefillContactId && (
                <View className="gap-2">
                  <AppText size="xs" color="muted">
                    Person
                  </AppText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                  >
                    <View className="flex-row gap-2">
                      {contacts.map((c) => (
                        <Chip
                          key={c.id}
                          variant={
                            selectedContactId === c.id ? "primary" : "secondary"
                          }
                          color={
                            selectedContactId === c.id ? "accent" : "default"
                          }
                          onPress={() => setSelectedContactId(c.id)}
                        >
                          <Chip.Label>{c.name}</Chip.Label>
                        </Chip>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {activeContact && prefillContactId && (
                <AppText size="sm" weight="medium" color="muted">
                  With: {activeContact.name}
                </AppText>
              )}

              {/* Interaction type */}
              <View className="gap-2">
                <AppText size="xs" color="muted">
                  Type
                </AppText>
                <View className="flex-row flex-wrap gap-2">
                  {INTERACTION_TYPES.map((t) => (
                    <Chip
                      key={t.value}
                      variant={type === t.value ? "primary" : "secondary"}
                      color={type === t.value ? "accent" : "default"}
                      onPress={() => setType(t.value)}
                    >
                      <Chip.Label>{t.label}</Chip.Label>
                    </Chip>
                  ))}
                </View>
              </View>

              {/* Date */}
              <View className="gap-2">
                <AppText size="xs" color="muted">
                  When
                </AppText>
                <View className="flex-row gap-2">
                  {DATE_OPTIONS.map((d) => (
                    <Chip
                      key={d.label}
                      variant={dateOffset === d.offset ? "primary" : "secondary"}
                      color={dateOffset === d.offset ? "accent" : "default"}
                      onPress={() => setDateOffset(d.offset)}
                    >
                      <Chip.Label>{d.label}</Chip.Label>
                    </Chip>
                  ))}
                </View>
              </View>

              {/* Note */}
              <View className="gap-2">
                <AppText size="xs" color="muted">
                  Note (optional)
                </AppText>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="How'd it go?"
                  multiline
                  numberOfLines={3}
                  className="rounded-xl bg-surface px-3 py-3 text-sm text-foreground"
                  placeholderTextColor={mutedColor as string}
                  style={{ minHeight: 80, textAlignVertical: "top" }}
                />
              </View>

              {/* Actions */}
              <View className="flex-row gap-3">
                <Button
                  variant="tertiary"
                  className="flex-1"
                  onPress={handleClose}
                >
                  <Button.Label>Cancel</Button.Label>
                </Button>
                <Button
                  className="flex-1"
                  onPress={handleSave}
                  isDisabled={!activeContactId || isSaving}
                >
                  <Button.Label>{isSaving ? "Saving…" : "Save"}</Button.Label>
                </Button>
              </View>
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
};
```

- [ ] **Step 3: Create Android sheet**

Create `apps/mobile/src/components/organisms/LogInteractionSheet/LogInteractionSheet.android.tsx`:

```tsx
import { useState } from "react";
import { View, ScrollView, TextInput } from "react-native";
import {
  ModalBottomSheet,
  Host,
  RNHostView,
} from "@expo/ui/jetpack-compose";
import { AppText } from "@/components/atoms/Text";
import { Button, Chip } from "heroui-native";
import { useCSSVariable } from "uniwind";
import { useLogInteractionSheetStore } from "@/stores/useLogInteractionSheetStore";
import { useInteractionsStore } from "@/stores/useInteractionsStore";
import { usePeopleData } from "@/hooks/usePeopleData";
import { useDatabase } from "@/hooks/useDatabase";
import type { Interaction } from "@/types";

const INTERACTION_TYPES: { value: Interaction["type"]; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "coffee", label: "Coffee" },
  { value: "text", label: "Text" },
  { value: "voicenote", label: "Voice Note" },
  { value: "other", label: "Other" },
];

const DATE_OPTIONS = [
  { label: "Today", offset: 0 },
  { label: "Yesterday", offset: 1 },
] as const;

function isoFromOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export const LogInteractionSheet = () => {
  const { isOpen, prefillContactId, close } = useLogInteractionSheetStore();
  const { contacts } = usePeopleData();
  const { db } = useDatabase();
  const store = useInteractionsStore();

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [type, setType] = useState<Interaction["type"]>("call");
  const [dateOffset, setDateOffset] = useState(0);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [mutedColor] = useCSSVariable(["--color-muted"]);

  const activeContactId = prefillContactId ?? selectedContactId;
  const activeContact = contacts.find((c) => c.id === activeContactId);

  const handleClose = () => {
    close();
    setSelectedContactId(null);
    setType("call");
    setDateOffset(0);
    setNote("");
    setIsSaving(false);
  };

  const handleSave = async () => {
    if (!activeContactId || !db) return;
    setIsSaving(true);
    try {
      await store.addInteraction(db, {
        contactId: activeContactId,
        type,
        note: note.trim() || undefined,
        occurredAt: isoFromOffset(dateOffset),
      });
    } finally {
      setIsSaving(false);
    }
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <Host style={{ position: "absolute", width: "100%", height: "100%" }}>
      <ModalBottomSheet onDismissRequest={handleClose} showDragHandle>
        <RNHostView matchContents>
          <View className="px-5 py-6 gap-5">
            <AppText size="xl" weight="bold" family="headline">
              Log Interaction
            </AppText>

            {!prefillContactId && (
              <View className="gap-2">
                <AppText size="xs" color="muted">Person</AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {contacts.map((c) => (
                      <Chip
                        key={c.id}
                        variant={selectedContactId === c.id ? "primary" : "secondary"}
                        color={selectedContactId === c.id ? "accent" : "default"}
                        onPress={() => setSelectedContactId(c.id)}
                      >
                        <Chip.Label>{c.name}</Chip.Label>
                      </Chip>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {activeContact && prefillContactId && (
              <AppText size="sm" weight="medium" color="muted">
                With: {activeContact.name}
              </AppText>
            )}

            <View className="gap-2">
              <AppText size="xs" color="muted">Type</AppText>
              <View className="flex-row flex-wrap gap-2">
                {INTERACTION_TYPES.map((t) => (
                  <Chip
                    key={t.value}
                    variant={type === t.value ? "primary" : "secondary"}
                    color={type === t.value ? "accent" : "default"}
                    onPress={() => setType(t.value)}
                  >
                    <Chip.Label>{t.label}</Chip.Label>
                  </Chip>
                ))}
              </View>
            </View>

            <View className="gap-2">
              <AppText size="xs" color="muted">When</AppText>
              <View className="flex-row gap-2">
                {DATE_OPTIONS.map((d) => (
                  <Chip
                    key={d.label}
                    variant={dateOffset === d.offset ? "primary" : "secondary"}
                    color={dateOffset === d.offset ? "accent" : "default"}
                    onPress={() => setDateOffset(d.offset)}
                  >
                    <Chip.Label>{d.label}</Chip.Label>
                  </Chip>
                ))}
              </View>
            </View>

            <View className="gap-2">
              <AppText size="xs" color="muted">Note (optional)</AppText>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="How'd it go?"
                multiline
                numberOfLines={3}
                className="rounded-xl bg-surface px-3 py-3 text-sm text-foreground"
                placeholderTextColor={mutedColor as string}
                style={{ minHeight: 80, textAlignVertical: "top" }}
              />
            </View>

            <View className="flex-row gap-3">
              <Button variant="tertiary" className="flex-1" onPress={handleClose}>
                <Button.Label>Cancel</Button.Label>
              </Button>
              <Button
                className="flex-1"
                onPress={handleSave}
                isDisabled={!activeContactId || isSaving}
              >
                <Button.Label>{isSaving ? "Saving…" : "Save"}</Button.Label>
              </Button>
            </View>
          </View>
        </RNHostView>
      </ModalBottomSheet>
    </Host>
  );
};
```

- [ ] **Step 4: Create the barrel export**

Create `apps/mobile/src/components/organisms/LogInteractionSheet/index.ts`:

```ts
export { LogInteractionSheet } from "./LogInteractionSheet";
```

- [ ] **Step 5: Type-check**

```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | grep -E "(LogInteractionSheet|useLogInteractionSheetStore)"
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/stores/useLogInteractionSheetStore.ts \
        apps/mobile/src/components/organisms/LogInteractionSheet/
git commit -m "feat(people): add LogInteractionSheet (iOS + Android) + store"
```

---

## Task 6: Mount `LogInteractionSheet` in layout + wire QuickActionSheet

**Files:**
- Modify: `apps/mobile/src/app/(main)/(tabs)/_layout.tsx`
- Modify: `apps/mobile/src/components/organisms/QuickActionSheet/QuickActionSheet.ios.tsx`
- Modify: `apps/mobile/src/components/organisms/QuickActionSheet/QuickActionSheet.android.tsx`

The sheet must be mounted at the tab layout level (next to `QuickActionSheet` and `SettingsSheet`) so it's available from both the FAB and the profile screen.

- [ ] **Step 1: Mount sheet in `_layout.tsx`**

In `apps/mobile/src/app/(main)/(tabs)/_layout.tsx`, add the import at the top:

```ts
import { LogInteractionSheet } from "@/components/organisms/LogInteractionSheet";
```

In the **NativeTabs branch** (around line 124), add `<LogInteractionSheet />` after `<SettingsSheet />`:

```tsx
        <NativeTabsFAB />
        <QuickActionSheet />
        <SettingsSheet />
        <LogInteractionSheet />
```

In the **Tabs branch** (around line 149), add the same after `<SettingsSheet />`:

```tsx
        <AppTabBarFAB />
        <QuickActionSheet />
        <SettingsSheet />
        <LogInteractionSheet />
```

- [ ] **Step 2: Wire "Log a chat" in QuickActionSheet iOS**

In `apps/mobile/src/components/organisms/QuickActionSheet/QuickActionSheet.ios.tsx`, add import:

```ts
import { useLogInteractionSheetStore } from "@/stores/useLogInteractionSheetStore";
```

Replace the `{ icon: ChatCircle, label: "Log a chat" }` entry with:

```ts
    {
      icon: ChatCircle,
      label: "Log a chat",
      onPress: () => {
        close();
        useLogInteractionSheetStore.getState().open();
      },
    },
```

- [ ] **Step 3: Wire "Log a chat" in QuickActionSheet Android**

In `apps/mobile/src/components/organisms/QuickActionSheet/QuickActionSheet.android.tsx`, add import:

```ts
import { useLogInteractionSheetStore } from "@/stores/useLogInteractionSheetStore";
```

Replace the `{ icon: ChatCircle, label: "Log a chat" }` entry with:

```ts
    {
      icon: ChatCircle,
      label: "Log a chat",
      onPress: () => {
        close();
        useLogInteractionSheetStore.getState().open();
      },
    },
```

- [ ] **Step 4: Type-check**

```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | grep -E "(_layout|QuickActionSheet)"
```

Expected: no new errors in those files

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/(main)/(tabs)/_layout.tsx \
        apps/mobile/src/components/organisms/QuickActionSheet/QuickActionSheet.ios.tsx \
        apps/mobile/src/components/organisms/QuickActionSheet/QuickActionSheet.android.tsx
git commit -m "feat(people): mount LogInteractionSheet in layout + wire QuickActionSheet Log a chat"
```

---

## Task 7: Profile screen `[id].tsx`

**Files:**
- Create: `apps/mobile/src/app/(main)/(tabs)/people/[id].tsx`

This is a push-navigation screen inside the existing `people/_layout.tsx` Stack. Sections: avatar header, "Talk about next time" topics, notes, interaction timeline, sticky "Log Interaction" button.

- [ ] **Step 1: Create the profile screen**

Create `apps/mobile/src/app/(main)/(tabs)/people/[id].tsx`:

```tsx
import { useState } from "react";
import { ScrollView, View, TextInput, Pressable } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Plus } from "phosphor-react-native";
import { Button } from "heroui-native";
import { useCSSVariable } from "uniwind";
import { AppText } from "@/components/atoms/Text";
import { WarmthAvatar } from "@/components/atoms/WarmthAvatar";
import { TopicChip } from "@/components/atoms/TopicChip";
import { InteractionEntry } from "@/components/molecules/InteractionEntry";
import { usePeopleData } from "@/hooks/usePeopleData";
import { useInteractionsData } from "@/hooks/useInteractionsData";
import { useLogInteractionSheetStore } from "@/stores/useLogInteractionSheetStore";
import { daysSince, warmthLevel, warmthLabel } from "@/utils/warmth";

export default function PersonProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { contacts, updateContact } = usePeopleData();
  const contact = contacts.find((c) => c.id === id);

  const { interactions, topics, addTopic, toggleTopicDone, removeTopic } =
    useInteractionsData(id ?? "");

  const [newTopicText, setNewTopicText] = useState("");
  const [isAddingTopic, setIsAddingTopic] = useState(false);

  const [mutedColor, primaryForegroundColor] = useCSSVariable([
    "--color-muted",
    "--color-primary-foreground",
  ]);

  if (!id || !contact) return null;

  const days = contact.lastInteractionAt
    ? daysSince(contact.lastInteractionAt)
    : undefined;
  const warmth = warmthLevel(days);
  const statusLabel = warmthLabel(warmth, days);

  const handleAddTopic = async () => {
    const trimmed = newTopicText.trim();
    if (!trimmed) return;
    await addTopic(trimmed);
    setNewTopicText("");
    setIsAddingTopic(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: contact.name }} />
      <ScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="px-5 pt-6 pb-40 gap-6"
      >
        {/* Header */}
        <View className="items-center gap-3">
          <WarmthAvatar name={contact.name} warmth={warmth} size="lg" />
          <View className="items-center gap-1">
            <AppText size="2xl" weight="bold" family="headline">
              {contact.name}
            </AppText>
            <AppText size="xs" color="muted">
              {statusLabel}
            </AppText>
          </View>
        </View>

        {/* Talk about next time */}
        <View className="gap-3">
          <AppText
            size="xs"
            weight="medium"
            color="muted"
            className="uppercase tracking-wide"
          >
            Talk About Next Time
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            {topics.map((t) => (
              <TopicChip
                key={t.id}
                topic={t}
                onToggle={() => void toggleTopicDone(t.id, !t.isDone)}
                onRemove={() => void removeTopic(t.id)}
              />
            ))}
            {isAddingTopic ? (
              <View className="flex-row items-center">
                <TextInput
                  value={newTopicText}
                  onChangeText={setNewTopicText}
                  placeholder="Topic…"
                  autoFocus
                  onBlur={() => void handleAddTopic()}
                  onSubmitEditing={() => void handleAddTopic()}
                  returnKeyType="done"
                  className="rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs text-foreground"
                  style={{ minWidth: 90 }}
                  placeholderTextColor={mutedColor as string}
                />
              </View>
            ) : (
              <Pressable
                onPress={() => setIsAddingTopic(true)}
                className="flex-row items-center gap-1 rounded-full border border-dashed border-muted/40 px-3 py-1.5"
              >
                <Plus size={10} weight="bold" color={mutedColor as string} />
                <AppText size="xs" color="muted">
                  Add topic
                </AppText>
              </Pressable>
            )}
          </View>
        </View>

        {/* Notes */}
        <View className="gap-3">
          <AppText
            size="xs"
            weight="medium"
            color="muted"
            className="uppercase tracking-wide"
          >
            Notes
          </AppText>
          <TextInput
            defaultValue={contact.notes ?? ""}
            onEndEditing={(e) =>
              void updateContact(id, { notes: e.nativeEvent.text })
            }
            placeholder="Add context about this person — interests, things they mentioned…"
            multiline
            className="rounded-xl bg-surface px-4 py-3 text-sm text-foreground"
            placeholderTextColor={mutedColor as string}
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />
        </View>

        {/* Interaction Timeline */}
        <View className="gap-3">
          <AppText
            size="xs"
            weight="medium"
            color="muted"
            className="uppercase tracking-wide"
          >
            Interactions
          </AppText>
          {interactions.length === 0 ? (
            <AppText size="sm" color="muted">
              No interactions logged yet.
            </AppText>
          ) : (
            <View className="rounded-xl bg-surface px-4">
              {interactions.map((interaction, i) => (
                <View key={interaction.id}>
                  {i > 0 && <View className="h-px bg-default/50" />}
                  <InteractionEntry interaction={interaction} />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky log button */}
      <View className="absolute bottom-0 left-0 right-0 bg-background/90 px-5 pb-safe pt-3">
        <Button
          variant="primary"
          onPress={() => useLogInteractionSheetStore.getState().open(id)}
        >
          <View className="flex-row items-center gap-1.5">
            <Plus
              size={16}
              weight="bold"
              color={primaryForegroundColor as string}
            />
            <Button.Label>Log Interaction</Button.Label>
          </View>
        </Button>
      </View>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | grep "\[id\]"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/src/app/(main)/(tabs)/people/[id].tsx"
git commit -m "feat(people): add Person Profile screen with topics, notes, interaction timeline"
```

---

## Task 8: Final Verification

**Files:** none (read-only verification)

- [ ] **Step 1: Run all tests**

```bash
cd apps/mobile
npx jest --no-coverage 2>&1 | tail -15
```

Expected: all suites pass, 0 failures

- [ ] **Step 2: Full type-check**

```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | grep -v "^$" | grep -v "node_modules" | grep -E "error TS" | grep -vE "(ai-test|HabitRow|PriorityRow|AddAccountSheet/index|AddBillSheet/index|AddGoalSheet/index|AddTransactionSheet/index|QuickActionSheet/index|SettingsSheet/index|peopleSchema\.test|QuestionScreen)" | head -20
```

Expected: 0 new errors from Plan 2 files

- [ ] **Step 3: Confirm profile navigation wired**

Grep that ContactList pushes to `[id]` route:

```bash
grep -n "people/\\\${" apps/mobile/src/components/organisms/ContactList/ContactList.tsx
```

Expected: matches line with `router.push(\`/(main)/(tabs)/people/\${id}\``

- [ ] **Step 4: Smoke-test checklist (manual, on simulator)**

1. Open People tab → tap a contact → confirm profile screen opens with name + warmth ring
2. Tap "Log Interaction" → sheet opens pre-filled with contact name, choose type + date → tap Save → timeline updates
3. Tap "Add topic" → type text → submit → chip appears; tap chip → strikethrough; tap X → chip removed
4. Edit Notes field, blur → kill + relaunch → notes persisted
5. From FAB (home/any tab) → Quick Actions → "Log a chat" → sheet opens with contact picker → select contact → save → contact's warmth updates in list

- [ ] **Step 5: Commit any lint fixes if needed**

```bash
cd apps/mobile
npx eslint src/stores/useInteractionsStore.ts \
           src/hooks/useInteractionsData.ts \
           "src/app/(main)/(tabs)/people/[id].tsx" \
           src/components/atoms/TopicChip/TopicChip.tsx \
           src/components/molecules/InteractionEntry/InteractionEntry.tsx \
           src/components/organisms/LogInteractionSheet/ \
           --fix 2>&1 | grep -v "^$"
git add -A && git commit -m "chore(people): fix lint in plan 2 files" 2>/dev/null || true
```

---

## Self-Review

**Spec coverage check:**
- ✅ Profile screen layout (header, topics, notes, timeline) — Task 7
- ✅ Warmth status label on profile — Task 7 (`warmthLabel`)
- ✅ "Talk about next time" topic chips — Tasks 4 + 7
- ✅ Notes editable inline — Task 7
- ✅ Interaction timeline (type icon, date, note) — Tasks 4 + 7
- ✅ "+ Log interaction" sticky button — Task 7
- ✅ LogInteractionSheet with type/date/note — Task 5
- ✅ Contact picker in sheet (for QuickActionSheet flow) — Task 5
- ✅ "Log a chat" wired in QuickActionSheet — Task 6
- ✅ patchContactMeta keeps list warmth current — Tasks 1 + 2

**Deferred (spec items intentionally not in Plan 2):**
- AI Insight card on profile — Plan 4
- Section 6 Life Events + gifts — Plan 3
- Section 7 Relationship Rewind — Plan 4
- Section 8 Pre-meet Briefing — Plan 4
- Edit button (name/phone/nudge freq) — Plan 3
