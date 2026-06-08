# Engine API — `@pedal/engine`

TypeScript murni: matchmaking + rating ELO + standings. Tanpa UI/DB, mudah di-unit-test, reusable di web & mobile.

```ts
import {
  generateAmericano, nextMexicanoRound,
  computeStandings, rateMatch,
  expectedScore, actualScore, kFactor, reliability,
} from "@pedal/engine";
```

## Matchmaking

### `generateAmericano(players, opts?)`
Jadwal Americano individual — tiap pemain berpasangan dengan tiap pemain lain tepat sekali (round-robin pasangan, *circle method*), lalu dipak ke lapangan.

- Sempurna untuk N kelipatan 4 (mis. 4 pemain → 3 ronde).
- Untuk N ≡ 2 (mod 4) ada satu pasangan beristirahat tiap ronde (keterbatasan kombinatorik wajar).
- `opts`: `{ courts, rounds }` opsional untuk batasi lapangan/ronde.

### `nextMexicanoRound(rankedPlayers, idx, opts?)`
Satu ronde Mexicano **dinamis** dari klasemen terbaru. Pola per lapangan: peringkat **1+4 vs 2+3** (menyeimbangkan kekuatan). Dipanggil ulang tiap ronde → leaderboard terus bergerak.

### Team (`teams.ts`)
Round-robin **tim tetap** — tiap pasangan tetap melawan semua tim lain tepat sekali (n−1 match/tim), dipak ke lapangan.

## Standings

### `computeStandings(results)`
Leaderboard event dari `MatchResult[]`. Urutan: **poin → selisih game → jumlah menang**.

## Rating ELO

### `rateMatch(result, players)`
Perubahan ELO 4 pemain dari satu match ganda. Rating tim = rata-rata 2 pemain; margin-aware (rasio skor, bukan menang/kalah biner); K-factor dinamis dari reliability.

```
R_A   = (rating_a1 + rating_a2) / 2          # rating tim
E_A   = 1 / (1 + 10^((R_B - R_A) / 400))     # ekspektasi menang
S_A   = score_a / (score_a + score_b)        # hasil aktual (margin-aware)
K     = reliability < stable ? 40 : 20       # swing besar saat masih provisional
delta = K * (S_A - E_A)                       # diterapkan ke kedua pemain tim
```

### Primitif ELO
| Fungsi | Kegunaan |
|---|---|
| `expectedScore(rA, rB)` | Probabilitas menang berbasis selisih rating |
| `actualScore(scoreA, scoreB)` | Rasio skor (margin-aware) |
| `kFactor(matchesPlayed)` | K-factor dinamis (provisional vs stabil) |
| `reliability(matchesPlayed)` | Keandalan rating 0–100% |

## Konstanta

| Konstanta | Nilai | Arti |
|---|---|---|
| `DEFAULT_RATING` | 1000 | Rating awal semua pemain baru |
| `PROVISIONAL_MATCHES` | 20 | Batas match sebelum rating dianggap stabil |
| `K_PROVISIONAL` | 40 | K-factor saat masih provisional (swing besar) |
| `K_STABLE` | 20 | K-factor setelah stabil |

## Contoh alur lengkap

```ts
import { generateAmericano, computeStandings, rateMatch } from "@pedal/engine";

const ids = ["a", "b", "c", "d"];
const rounds = generateAmericano(ids);        // 3 ronde

// ...mainkan, kumpulkan MatchResult[] dari skor yang diinput...

const standings = computeStandings(results);  // leaderboard event
for (const match of results) {
  const deltas = rateMatch(match, players);   // delta ELO per pemain
  // simpan deltas ke RatingHistory untuk leaderboard global
}
```

## Test

```bash
npm test   # vitest — 39 test (elo, teams, americano, standings)
```
