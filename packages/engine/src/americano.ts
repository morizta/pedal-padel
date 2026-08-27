/**
 * Generator jadwal Americano (format individual) — ROUND-ROBIN PASANGAN PENUH.
 *
 * Inti Americano: tiap pemain BERPASANGAN dengan SETIAP pemain lain tepat sekali.
 *
 * Algoritma (3 tahap):
 *  1. 1-FAKTORISASI K_n (metode lingkaran): semua C(n,2) pasangan dipecah jadi
 *     "gelombang". Satu gelombang = pasangan-pasangan yang SALING LEPAS (tak
 *     berbagi pemain) dan mencakup seluruh pemain. n genap → n−1 gelombang;
 *     n ganjil → n gelombang, tiap gelombang satu pemain istirahat.
 *  2. Pasangan dalam satu gelombang dijodohkan jadi match (2 pasangan = 4 orang)
 *     dengan memilih kombinasi yang MEMINIMALKAN pengulangan lawan. Pasangan
 *     sisa (gelombang berjumlah ganjil) masuk KOLAM TUNDA dan dijodohkan dengan
 *     sisa gelombang lain, sehingga jumlah match tetap maksimal ⌊C(n,2)/2⌋.
 *  3. Match dikemas ke ronde × lapangan. Karena match satu gelombang saling
 *     lepas, ronde bisa terisi PENUH; pemilihan sadar-recency menjaga tak ada
 *     yang main beruntun panjang.
 *
 * Sifat hasil:
 *  - Tiap pasangan berpasangan ≤ 1×; C(n,2) genap → semua pasangan kebagian,
 *    C(n,2) ganjil → tepat satu pasangan absen (batas teoretis).
 *  - Selisih jumlah main antar pemain ≤ 1.
 *  - Lawan tersebar rata (n kelipatan 4: tiap pasang bertemu ±2× saja).
 */

import type { PlayerId, Round } from "./types.js";

export interface AmericanoOptions {
  /** Jumlah lapangan. Default: sebanyak mungkin = floor(N/4). */
  courts?: number;
}

type Pair = [number, number];
type Match = [number, number, number, number]; // [a,b] vs [c,d]

/**
 * 1-faktorisasi K_n dengan metode lingkaran: pemain 0 diam, sisanya berputar.
 * n ganjil ditangani lewat pemain bayangan (indeks n) — pasangannya berarti
 * pemain tsb istirahat di gelombang itu.
 */
function waves(n: number): Pair[][] {
  const size = n % 2 === 0 ? n : n + 1;
  const m = size - 1; // jumlah pemain yang berputar
  const rot = Array.from({ length: m }, (_, i) => i + 1);
  const out: Pair[][] = [];
  for (let r = 0; r < m; r++) {
    const pairs: Pair[] = [];
    const add = (a: number, b: number) => {
      if (a < n && b < n) pairs.push(a < b ? [a, b] : [b, a]);
    };
    add(0, rot[r % m]!);
    for (let i = 1; i < size / 2; i++) {
      add(rot[(r + i) % m]!, rot[(((r - i) % m) + m) % m]!);
    }
    out.push(pairs);
  }
  return out;
}

export function generateAmericano(
  players: readonly PlayerId[],
  opts: AmericanoOptions = {}
): Round[] {
  const n = players.length;
  if (n < 4) throw new Error("Americano needs at least 4 players.");

  const courts = opts.courts ?? Math.floor(n / 4);
  if (courts < 1) throw new Error("Needs at least 1 court (≥4 players).");
  if (courts * 4 > n) {
    throw new Error(
      `Too many courts: need ${courts * 4} players for ${courts} courts, only ${n} available.`
    );
  }

  // ── Tahap 2: gelombang → match, hemat pengulangan lawan ──────────────
  const opp: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const allMatches: Match[] = [];
  const pending: Pair[] = []; // kolam tunda: pasangan yang belum dapat lawan

  /**
   * Biaya "sudah pernah berhadapan" untuk 4 orang ini. Dikuadratkan supaya
   * bertemu 1× empat kali jauh lebih murah daripada bertemu 4× sekali —
   * yang bikin sebaran lawan rata, bukan menumpuk di segelintir pasangan.
   */
  const cost = (p: Pair, q: Pair): number => {
    let c = 0;
    for (const a of p) for (const b of q) c += opp[a]![b]! ** 2;
    return c;
  };

  const disjoint = (p: Pair, q: Pair): boolean =>
    p[0] !== q[0] && p[0] !== q[1] && p[1] !== q[0] && p[1] !== q[1];

  const commit = (p: Pair, q: Pair) => {
    allMatches.push([p[0], p[1], q[0], q[1]]);
    for (const a of p)
      for (const b of q) {
        opp[a]![b]! += 1;
        opp[b]![a]! += 1;
      }
  };

  /**
   * Cari penjodohan TERBAIK untuk satu kolam kecil secara menyeluruh.
   * Di dalam satu gelombang semua pasangan saling lepas, jadi biaya tiap match
   * saling bebas → penjumlahan sederhana sudah eksak. Dibatasi ke kolam kecil
   * (≤ 10 pasangan, ≤ 945 kemungkinan) agar tetap instan.
   */
  const exact = (pool: Pair[]): [Pair, Pair][] | null => {
    let best: [Pair, Pair][] | null = null;
    let bestCost = Infinity;
    const chosen: [Pair, Pair][] = [];
    const taken = new Array<boolean>(pool.length).fill(false);
    const walk = (from: number, acc: number, skips: number) => {
      if (acc >= bestCost) return; // sudah kalah, tak usah dilanjut
      let i = from;
      while (i < pool.length && taken[i]) i++;
      if (i >= pool.length) {
        bestCost = acc;
        best = chosen.map((m) => [m[0], m[1]] as [Pair, Pair]);
        return;
      }
      taken[i] = true;
      for (let j = i + 1; j < pool.length; j++) {
        if (taken[j] || !disjoint(pool[i]!, pool[j]!)) continue;
        taken[j] = true;
        chosen.push([pool[i]!, pool[j]!]);
        walk(i + 1, acc + cost(pool[i]!, pool[j]!), skips);
        chosen.pop();
        taken[j] = false;
      }
      if (skips > 0) walk(i + 1, acc, skips - 1); // pasangan ini absen
      taken[i] = false;
    };
    // Sisa yang boleh absen: kolam ganjil menyisakan 1; beri toleransi 1 lagi
    // untuk kolam tunda yang isinya bisa saling bertabrakan.
    walk(0, 0, (pool.length % 2) + 1);
    return best;
  };

  /** Jodohkan pasangan dalam kolam (greedy: biaya lawan terkecil dulu). */
  const drain = (pool: Pair[]) => {
    if (pool.length <= 10) {
      const plan = exact(pool);
      if (plan) {
        for (const [p, q] of plan) commit(p, q);
        const done = new Set(plan.flat());
        for (let i = pool.length - 1; i >= 0; i--)
          if (done.has(pool[i]!)) pool.splice(i, 1);
        return;
      }
    }
    for (;;) {
      let bi = -1;
      let bj = -1;
      let best = Infinity;
      for (let i = 0; i < pool.length; i++)
        for (let j = i + 1; j < pool.length; j++) {
          if (!disjoint(pool[i]!, pool[j]!)) continue;
          const c = cost(pool[i]!, pool[j]!);
          if (c < best) {
            best = c;
            bi = i;
            bj = j;
          }
        }
      if (bi < 0) break;
      commit(pool[bi]!, pool[bj]!);
      pool.splice(bj, 1);
      pool.splice(bi, 1);
    }
  };

  for (const wave of waves(n)) {
    // Pasangan satu gelombang selalu saling lepas → semua bisa dijodohkan,
    // sisanya (kalau ganjil) ikut kolam tunda bersama sisa gelombang lain.
    const pool = [...wave, ...pending.splice(0)];
    drain(pool);
    pending.push(...pool); // yang tak kebagian lawan disjoint, coba lagi nanti
  }
  drain(pending); // percobaan terakhir untuk sisa

  // ── Tahap 3: match → ronde × lapangan ────────────────────────────────
  // Dua strategi pengemasan, lalu diambil yang paling padat (ronde paling
  // sedikit). Keduanya murah, dan pemenangnya berbeda-beda tergantung jumlah
  // pemain vs lapangan — jadi lebih aman dicoba dua-duanya:
  //  - "urut"    : ambil match sesuai urutan lahir. Match satu gelombang
  //                berurutan & saling lepas → ronde cenderung penuh.
  //  - "seimbang": utamakan pemain yang baru istirahat. Kadang memampatkan
  //                lebih baik saat lapangan lebih sedikit dari gelombangnya.
  const pack = (mode: "urut" | "seimbang"): Match[][] => {
    const remaining = allMatches.slice();
    const consec = new Array<number>(n).fill(0);
    const played = new Array<number>(n).fill(0);
    const out: Match[][] = [];
    while (remaining.length) {
      const using = new Set<number>();
      const ms: Match[] = [];
      if (mode === "urut") {
        for (let k = 0; k < remaining.length && ms.length < courts; k++) {
          const mm = remaining[k]!;
          if (mm.some((p) => using.has(p))) continue;
          ms.push(mm);
          for (const p of mm) using.add(p);
          remaining.splice(k, 1);
          k -= 1;
        }
      } else {
        while (ms.length < courts) {
          let bestK = -1;
          let bestScore = Infinity;
          for (let k = 0; k < remaining.length; k++) {
            const mm = remaining[k]!;
            if (mm.some((p) => using.has(p))) continue;
            let score = 0;
            for (const p of mm) score += consec[p]! * 1000 + played[p]!;
            score = score * 10_000 + k; // urutan lahir sebagai pemecah seri
            if (score < bestScore) {
              bestScore = score;
              bestK = k;
            }
          }
          if (bestK < 0) break;
          const picked = remaining.splice(bestK, 1)[0]!;
          ms.push(picked);
          for (const p of picked) using.add(p);
        }
      }
      for (let p = 0; p < n; p++) {
        if (using.has(p)) {
          consec[p] = consec[p]! + 1;
          played[p] = played[p]! + 1;
        } else {
          consec[p] = 0;
        }
      }
      out.push(ms);
    }
    return out;
  };

  const rate = (bs: Match[][]): number =>
    bs.length * 1000 + bs.filter((ms) => ms.length < courts).length;
  const a = pack("urut");
  const b = pack("seimbang");
  const buckets = rate(b) < rate(a) ? b : a;
  const consec = new Array<number>(n).fill(0);

  // Rapikan: ronde yang belum penuh (bukan yang terakhir) ditambal dengan match
  // dari ronde berikutnya yang tak bentrok. Greedy di atas kadang menyisakan
  // ronde "bolong" di tengah; tambalan ini memampatkannya → ronde lebih sedikit
  // dan hanya ronde TERAKHIR yang boleh kurang dari jumlah lapangan.
  for (let i = 0; i < buckets.length; i++) {
    const here = buckets[i]!;
    const busy = new Set<number>(here.flat());
    for (let j = i + 1; j < buckets.length && here.length < courts; j++) {
      const later = buckets[j]!;
      for (let k = 0; k < later.length && here.length < courts; k++) {
        const mm = later[k]!;
        if (mm.some((p) => busy.has(p))) continue;
        here.push(mm);
        for (const p of mm) busy.add(p);
        later.splice(k, 1);
        k -= 1;
      }
    }
  }

  // Urutkan ulang ronde supaya main/istirahat menyebar: tiap langkah pilih ronde
  // yang pemainnya paling "butuh istirahat" paling sedikit (consec terkecil).
  // Ronde yang tak penuh ditaruh paling belakang — hanya ronde TERAKHIR yang
  // boleh kurang dari jumlah lapangan.
  const full = buckets.filter((ms) => ms.length >= courts);
  const partial = buckets.filter((ms) => ms.length > 0 && ms.length < courts);
  consec.fill(0);
  const ordered: Match[][] = [];
  while (full.length) {
    let bestK = 0;
    let bestScore = Infinity;
    for (let k = 0; k < full.length; k++) {
      let score = 0;
      for (const p of full[k]!.flat()) score += consec[p]!;
      if (score < bestScore) {
        bestScore = score;
        bestK = k;
      }
    }
    const picked = full.splice(bestK, 1)[0]!;
    const using = new Set<number>(picked.flat());
    for (let p = 0; p < n; p++) consec[p] = using.has(p) ? consec[p]! + 1 : 0;
    ordered.push(picked);
  }

  return [...ordered, ...partial]
    .map((ms, idx) => {
      const using = new Set<number>(ms.flat());
      return {
        index: idx,
        matches: ms.map((mm, c) => ({
          court: c + 1,
          teamA: [players[mm[0]]!, players[mm[1]]!],
          teamB: [players[mm[2]]!, players[mm[3]]!],
        })),
        resting: players.filter((_, pi) => !using.has(pi)),
      };
    });
}
