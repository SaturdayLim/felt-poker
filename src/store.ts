import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { Game, GameType, Group, Hand, ID, Player, PlayerStatus, Settings } from './types';
import { uid } from './lib/ids';
import { defaultPayoutPercents, playerStatus, rebuildTransfers, round2, totalPotMoney } from './lib/calc';

const idbStorage: StateStorage = {
  getItem: async (name) => (await idbGet<string>(name)) ?? null,
  setItem: async (name, value) => { await idbSet(name, value); },
  removeItem: async (name) => { await idbDel(name); },
};

/** Opening screen length. 3s lets the logo draw (1.85s) and hold for about a second; splash screens
    longer than about 3 seconds start to feel like a wait. */
export const SPLASH_DEFAULT = 3000;
/** Read by the splash page (index.html) before it paints, so it can skip or set its own length. */
export const SPLASH_KEY = 'felt-splash-ms';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  splashMs: SPLASH_DEFAULT,
  minRaise: 'last',
  entryMode: 'bets',
  currency: 'S$',
  unitValue: 0.1,
  sb: 1,
  bb: 2,
  defaultBuyIn: 200,
  tournamentBuyIn: 20,
  startingStack: 10000,
  tags: ['Bad beat', 'Cooler', 'Bluff shown', 'Hero call', 'Ran it twice', 'Hand of the night'],
  markers: { dealer: true, allIn: true, straddle: true, tags: true },
};

export interface NewGameInput {
  type: GameType;
  name: string;
  playerIds: ID[];
  currency: string;
  unitValue: number;
  sb: number;
  bb: number;
  defaultBuyIn: number;
  tournamentBuyIn: number;
  startingStack: number;
  autoBuyIn: boolean;
  groupId?: ID;
}

export interface BackupData {
  app: 'felt';
  version: 1;
  exportedAt: number;
  players: Player[];
  games: Game[];
  settings: Settings;
  groups?: Group[];
}

interface State {
  players: Player[];
  games: Game[];
  groups: Group[];
  settings: Settings;
  hydrated: boolean;

  saveGroup: (g: Group) => void;
  deleteGroup: (id: ID) => void;
  settleGroup: (id: ID) => void;

  addPlayer: (name: string) => Player;
  renamePlayer: (id: ID, name: string) => void;
  setPlayerArchived: (id: ID, archived: boolean) => void;
  deletePlayer: (id: ID) => boolean;

  createGame: (input: NewGameInput) => Game;
  updateGame: (id: ID, fn: (g: Game) => void) => void;
  deleteGame: (id: ID) => void;

  addPlayerToGame: (gameId: ID, playerId: ID, buyIn?: number) => void;
  addBuyIn: (gameId: ID, playerId: ID, amount: number) => void;
  removeBuyIn: (gameId: ID, buyInId: ID) => void;
  setStatus: (gameId: ID, playerId: ID, status: PlayerStatus) => void;
  clockOut: (gameId: ID, playerId: ID, chips: number) => void;
  setCashOut: (gameId: ID, playerId: ID, chips: number | null) => void;
  bust: (gameId: ID, playerId: ID) => void;
  unbust: (gameId: ID, playerId: ID) => void;

  saveHand: (gameId: ID, hand: Hand) => void;
  deleteHand: (gameId: ID, handId: ID) => void;

  finishGame: (gameId: ID) => void;
  reopenGame: (gameId: ID) => void;
  refreshTransfers: (gameId: ID) => void;
  setTransferResolved: (gameId: ID, transferId: ID, resolved: boolean) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  importBackup: (data: BackupData) => void;
  exportBackup: () => BackupData;
  eraseAll: () => void;
}

const now = () => Date.now();

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const mutateGame = (id: ID, fn: (g: Game) => void) =>
        set((s) => ({
          games: s.games.map((g) => {
            if (g.id !== id) return g;
            const copy = structuredClone(g);
            fn(copy);
            return copy;
          }),
        }));

      return {
        players: [],
        games: [],
        groups: [],
        settings: DEFAULT_SETTINGS,
        hydrated: false,

        saveGroup: (grp) =>
          set((s) => ({ groups: s.groups.some((x) => x.id === grp.id) ? s.groups.map((x) => (x.id === grp.id ? grp : x)) : [...s.groups, grp] })),
        deleteGroup: (id) =>
          set((s) => ({
            groups: s.groups.filter((x) => x.id !== id),
            games: s.games.map((g) => (g.groupId === id ? { ...g, groupId: undefined } : g)),
          })),
        settleGroup: (id) =>
          set((s) => {
            const t = now();
            return {
              games: s.games.map((g) =>
                g.groupId === id && g.status === 'closed' && g.transfers.some((x) => !x.resolved)
                  ? { ...g, transfers: g.transfers.map((x) => (x.resolved ? x : { ...x, resolved: true, resolvedAt: t })) }
                  : g),
            };
          }),

        addPlayer: (name) => {
          const p: Player = { id: uid(), name: name.trim(), createdAt: now() };
          set((s) => ({ players: [...s.players, p] }));
          return p;
        },
        renamePlayer: (id, name) =>
          set((s) => ({ players: s.players.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)) })),
        setPlayerArchived: (id, archived) =>
          set((s) => ({ players: s.players.map((p) => (p.id === id ? { ...p, archived } : p)) })),
        deletePlayer: (id) => {
          if (get().games.some((g) => g.playerIds.includes(id))) return false;
          set((s) => ({ players: s.players.filter((p) => p.id !== id) }));
          return true;
        },

        createGame: (input) => {
          const t = now();
          const g: Game = {
            id: uid(),
            name: input.name.trim() || (input.type === 'cash' ? 'Cash Game' : 'Tournament'),
            type: input.type,
            status: 'live',
            createdAt: t,
            startedAt: t,
            currency: input.currency,
            unitValue: input.unitValue,
            sb: input.sb,
            bb: input.bb,
            defaultBuyIn: input.defaultBuyIn,
            playerIds: [],
            seats: {},
            buyIns: [],
            cashOuts: [],
            statusEvents: [],
            hands: [],
            expenses: [],
            transfers: [],
            groupId: input.groupId,
            tournament:
              input.type === 'tournament'
                ? { buyIn: input.tournamentBuyIn, startingStack: input.startingStack, bustOrder: [], payouts: [] }
                : undefined,
          };
          input.playerIds.forEach((pid, i) => {
            g.playerIds.push(pid);
            g.seats[pid] = i + 1;
            g.statusEvents.push({ playerId: pid, status: 'playing', at: t });
            if (input.autoBuyIn || input.type === 'tournament')
              g.buyIns.push({
                id: uid(),
                playerId: pid,
                amount: input.type === 'cash' ? input.defaultBuyIn : input.tournamentBuyIn,
                at: t,
              });
          });
          if (g.tournament && !g.tournament.customPayouts) g.tournament.payouts = suggestPayouts(g);
          set((s) => ({ games: [g, ...s.games] }));
          return g;
        },
        updateGame: mutateGame,
        deleteGame: (id) => set((s) => ({ games: s.games.filter((g) => g.id !== id) })),

        addPlayerToGame: (gameId, playerId, buyIn) =>
          mutateGame(gameId, (g) => {
            const t = now();
            if (!g.playerIds.includes(playerId)) {
              g.playerIds.push(playerId);
              const used = new Set(Object.values(g.seats));
              let seat = 1;
              while (used.has(seat)) seat++;
              g.seats[playerId] = seat;
            }
            g.statusEvents.push({ playerId, status: 'playing', at: t });
            const amount = buyIn ?? (g.type === 'cash' ? g.defaultBuyIn : g.tournament!.buyIn);
            if (amount > 0) g.buyIns.push({ id: uid(), playerId, amount, at: t });
            if (g.tournament && !g.tournament.customPayouts) g.tournament.payouts = suggestPayouts(g);
          }),
        addBuyIn: (gameId, playerId, amount) =>
          mutateGame(gameId, (g) => {
            const t = now();
            g.buyIns.push({ id: uid(), playerId, amount, at: t });
            if (playerStatus(g, playerId) === 'out') g.statusEvents.push({ playerId, status: 'playing', at: t });
            if (g.tournament) {
              g.tournament.bustOrder = g.tournament.bustOrder.filter((p) => p !== playerId);
              if (!g.tournament.customPayouts) g.tournament.payouts = suggestPayouts(g);
            }
          }),
        removeBuyIn: (gameId, buyInId) =>
          mutateGame(gameId, (g) => {
            g.buyIns = g.buyIns.filter((b) => b.id !== buyInId);
            if (g.tournament && !g.tournament.customPayouts) g.tournament.payouts = suggestPayouts(g);
          }),
        setStatus: (gameId, playerId, status) =>
          mutateGame(gameId, (g) => {
            g.statusEvents.push({ playerId, status, at: now() });
          }),
        clockOut: (gameId, playerId, chips) =>
          mutateGame(gameId, (g) => {
            const t = now();
            g.cashOuts.push({ id: uid(), playerId, amount: chips, at: t });
            g.statusEvents.push({ playerId, status: 'out', at: t });
          }),
        setCashOut: (gameId, playerId, chips) =>
          mutateGame(gameId, (g) => {
            const prev = g.cashOuts.filter((c) => c.playerId === playerId);
            g.cashOuts = g.cashOuts.filter((c) => c.playerId !== playerId);
            if (chips !== null)
              g.cashOuts.push({ id: uid(), playerId, amount: chips, at: prev[prev.length - 1]?.at ?? now() });
          }),
        bust: (gameId, playerId) =>
          mutateGame(gameId, (g) => {
            const t = g.tournament!;
            if (!t.bustOrder.includes(playerId)) t.bustOrder.push(playerId);
            g.statusEvents.push({ playerId, status: 'out', at: now() });
          }),
        unbust: (gameId, playerId) =>
          mutateGame(gameId, (g) => {
            const t = g.tournament!;
            t.bustOrder = t.bustOrder.filter((p) => p !== playerId);
            g.statusEvents.push({ playerId, status: 'playing', at: now() });
          }),

        saveHand: (gameId, hand) =>
          mutateGame(gameId, (g) => {
            const i = g.hands.findIndex((h) => h.id === hand.id);
            if (i >= 0) g.hands[i] = hand;
            else g.hands.push(hand);
            g.hands.sort((a, b) => a.n - b.n);
          }),
        deleteHand: (gameId, handId) =>
          mutateGame(gameId, (g) => {
            g.hands = g.hands.filter((h) => h.id !== handId);
          }),

        finishGame: (gameId) =>
          mutateGame(gameId, (g) => {
            const t = now();
            for (const pid of g.playerIds)
              if (playerStatus(g, pid) !== 'out') g.statusEvents.push({ playerId: pid, status: 'out', at: t });
            g.status = 'closed';
            g.endedAt = t;
            g.transfers = rebuildTransfers(g);
          }),
        reopenGame: (gameId) =>
          mutateGame(gameId, (g) => {
            g.status = 'live';
            g.endedAt = undefined;
          }),
        refreshTransfers: (gameId) =>
          mutateGame(gameId, (g) => {
            g.transfers = rebuildTransfers(g);
          }),
        setTransferResolved: (gameId, transferId, resolved) =>
          mutateGame(gameId, (g) => {
            const tr = g.transfers.find((x) => x.id === transferId);
            if (tr) {
              tr.resolved = resolved;
              tr.resolvedAt = resolved ? now() : undefined;
            }
          }),

        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        // Theme and opening screen are this phone's own preferences: a restore never changes them.
        importBackup: (data) =>
          set((s) => ({
            players: data.players,
            games: data.games,
            groups: data.groups ?? [],
            settings: { ...DEFAULT_SETTINGS, ...data.settings, theme: s.settings.theme, splashMs: s.settings.splashMs, markers: { ...DEFAULT_SETTINGS.markers, ...(data.settings?.markers ?? {}) } },
          })),
        exportBackup: () => {
          const s = get();
          return { app: 'felt', version: 1, exportedAt: now(), players: s.players, games: s.games, groups: s.groups, settings: s.settings };
        },
        eraseAll: () => set((s) => ({ players: [], games: [], groups: [], settings: { ...DEFAULT_SETTINGS, theme: s.settings.theme, splashMs: s.settings.splashMs } })),
      };
    },
    {
      name: 'felt-store',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ players: s.players, games: s.games, groups: s.groups, settings: s.settings }) as unknown as State,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          ...p,
          groups: p.groups ?? [],
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p.settings ?? {}),
            // 'system' was the name for 'auto' before the Saturday Signature reskin
            theme: (p.settings?.theme as string) === 'system' || !p.settings?.theme ? 'auto' : p.settings.theme,
            markers: { ...DEFAULT_SETTINGS.markers, ...(p.settings?.markers ?? {}) },
          },
        };
      },
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Payouts in money, rounded down to whole currency, remainder to 1st. */
export function suggestPayouts(g: Game): number[] {
  const pool = totalPotMoney(g);
  const pct = defaultPayoutPercents(g.playerIds.length);
  const pays = pct.map((p) => Math.floor((pool * p) / 100));
  const rest = round2(pool - pays.reduce((a, b) => a + b, 0));
  pays[0] = round2(pays[0] + rest);
  return pays;
}

export const useGame = (id: ID | undefined) => useStore((s) => s.games.find((g) => g.id === id));

export function usePlayerName() {
  const players = useStore((s) => s.players);
  return (id: ID | undefined) => players.find((p) => p.id === id)?.name ?? 'Unknown player';
}
