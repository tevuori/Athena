import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Brain, Plus, Trash2 } from "lucide-react";
import { flashcardsApi } from "../services/flashcards";
import type { Flashcard, FlashcardDeck } from "../types";
import { MobileContainer, MobileEmpty, MobileFab, MobileHeader, MobileInput, MobileLoading, MobileTextarea } from "./MobileUi";

const DECK_COLORS = ["#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#06b6d4", "#8b5cf6"];

export default function MobileFlashcards({ onClose }: { onClose?: () => void }) {
  const [decks, setDecks] = useState<(FlashcardDeck & { _count: { cards: number } })[]>([]);
  const [view, setView] = useState<"decks" | "cards" | "review">("decks");
  const [selectedDeck, setSelectedDeck] = useState<FlashcardDeck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);

  const [showDeckForm, setShowDeckForm] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [deckDesc, setDeckDesc] = useState("");
  const [deckColor, setDeckColor] = useState(DECK_COLORS[0]);

  const [showCardForm, setShowCardForm] = useState(false);
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");

  const [reviewQueue, setReviewQueue] = useState<Flashcard[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const loadDecks = useCallback(async () => {
    setLoading(true);
    const res = await flashcardsApi.listDecks().catch(() => null);
    setDecks(res?.decks ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDecks();
  }, [loadDecks]);

  const openDeck = useCallback(async (deck: FlashcardDeck) => {
    setSelectedDeck(deck);
    setView("cards");
    setLoading(true);
    const res = await flashcardsApi.listCards(deck.id).catch(() => null);
    setCards(res?.cards ?? []);
    setLoading(false);
  }, []);

  const createDeck = async () => {
    if (!deckName.trim()) return;
    await flashcardsApi
      .createDeck({ name: deckName.trim(), description: deckDesc, color: deckColor })
      .catch(() => {});
    setShowDeckForm(false);
    setDeckName("");
    setDeckDesc("");
    setDeckColor(DECK_COLORS[0]);
    await loadDecks();
  };

  const deleteDeck = async (deck: FlashcardDeck & { _count: { cards: number } }) => {
    if (!window.confirm(`Delete "${deck.name}" and its ${deck._count.cards} cards?`)) return;
    await flashcardsApi.deleteDeck(deck.id).catch(() => {});
    await loadDecks();
  };

  const createCard = async () => {
    if (!cardFront.trim() || !cardBack.trim() || !selectedDeck) return;
    await flashcardsApi
      .createCard(selectedDeck.id, { front: cardFront.trim(), back: cardBack.trim() })
      .catch(() => {});
    setShowCardForm(false);
    setCardFront("");
    setCardBack("");
    if (selectedDeck) await openDeck(selectedDeck);
    await loadDecks();
  };

  const deleteCard = async (id: string) => {
    if (!window.confirm("Delete this card?")) return;
    await flashcardsApi.deleteCard(id).catch(() => {});
    if (selectedDeck) await openDeck(selectedDeck);
    await loadDecks();
  };

  const startReview = () => {
    if (!selectedDeck) return;
    const due = cards.filter((c) => new Date(c.dueDate) <= new Date());
    const queue = due.length ? due : cards;
    if (queue.length === 0) return;
    setReviewQueue(queue);
    setReviewIdx(0);
    setFlipped(false);
    setView("review");
  };

  const reviewCard = async (quality: number) => {
    const card = reviewQueue[reviewIdx];
    if (!card) return;
    await flashcardsApi.reviewCard(card.id, quality).catch(() => {});
    if (reviewIdx + 1 < reviewQueue.length) {
      setReviewIdx((i) => i + 1);
      setFlipped(false);
    } else {
      setView("cards");
      if (selectedDeck) await openDeck(selectedDeck);
      await loadDecks();
    }
  };

  const DeckForm = () => (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={() => setShowDeckForm(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-semibold text-white">New deck</h2>
        <MobileInput
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder="Deck name"
          className="mb-3"
        />
        <MobileTextarea
          value={deckDesc}
          onChange={(e) => setDeckDesc(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="mb-3"
        />
        <div className="mb-4 flex gap-2">
          {DECK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setDeckColor(c)}
              className={`h-8 w-8 rounded-full border-2 ${deckColor === c ? "border-white" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowDeckForm(false)}
            className="rounded-xl px-4 py-2 text-sm text-slate-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void createDeck()}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );

  const CardForm = () => (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={() => setShowCardForm(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-semibold text-white">New card</h2>
        <MobileTextarea
          value={cardFront}
          onChange={(e) => setCardFront(e.target.value)}
          placeholder="Front (question)"
          rows={2}
          className="mb-3"
        />
        <MobileTextarea
          value={cardBack}
          onChange={(e) => setCardBack(e.target.value)}
          placeholder="Back (answer)"
          rows={3}
          className="mb-4"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowCardForm(false)}
            className="rounded-xl px-4 py-2 text-sm text-slate-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void createCard()}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );

  if (view === "review" && selectedDeck && reviewQueue[reviewIdx]) {
    const card = reviewQueue[reviewIdx];
    const progress = ((reviewIdx + 1) / reviewQueue.length) * 100;
    return (
      <div className="flex h-full flex-col bg-slate-950 px-5 pb-7 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView("cards")}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[.06] text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <p className="text-sm font-medium text-indigo-300">Reviewing {selectedDeck.name}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[.1]">
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {reviewIdx + 1} / {reviewQueue.length}
            </p>
          </div>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center">
          <div
            onClick={() => setFlipped(!flipped)}
            className="relative w-full max-w-sm"
            style={{ perspective: "1000px" }}
          >
            <div
              className="relative min-h-[280px] w-full rounded-3xl border border-white/10 p-8 text-center transition-transform duration-500"
              style={{
                transformStyle: "preserve-3d",
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                backgroundColor: selectedDeck.color + "15",
              }}
            >
              <div
                className="absolute inset-0 flex flex-col items-center justify-center p-8"
                style={{ backfaceVisibility: "hidden" }}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Question</p>
                <p className="text-xl font-medium text-white">{card.front}</p>
                <p className="absolute bottom-6 text-xs text-slate-500">Tap to flip</p>
              </div>
              <div
                className="absolute inset-0 flex flex-col items-center justify-center p-8"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: selectedDeck.color }}>
                  Answer
                </p>
                <p className="text-lg text-white">{card.back}</p>
                <p className="absolute bottom-6 text-xs text-slate-500">How well did you know this?</p>
              </div>
            </div>
          </div>
        </div>

        {flipped ? (
          <div className="grid grid-cols-2 gap-2 pt-4">
            {[
              { label: "Again", quality: 0, color: "bg-rose-500" },
              { label: "Hard", quality: 1, color: "bg-orange-500" },
              { label: "Good", quality: 2, color: "bg-emerald-500" },
              { label: "Easy", quality: 3, color: "bg-sky-500" },
            ].map(({ label, quality, color }) => (
              <button
                key={label}
                type="button"
                onClick={() => void reviewCard(quality)}
                className={`rounded-2xl py-3 text-sm font-semibold text-white ${color}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-slate-400">Tap the card to see the answer</p>
        )}
      </div>
    );
  }

  if (view === "cards" && selectedDeck) {
    return (
      <MobileContainer>
        <MobileHeader
          title={selectedDeck.name}
          subtitle="Deck"
          onBack={() => setView("decks")}
          right={
            <div className="flex items-center gap-2">
              {cards.some((c) => new Date(c.dueDate) <= new Date()) && (
                <button
                  type="button"
                  onClick={startReview}
                  className="rounded-2xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white"
                >
                  <Brain size={16} className="inline mr-1" /> Study
                </button>
              )}
              <MobileFab onClick={() => setShowCardForm(true)} icon={<Plus size={22} />} />
            </div>
          }
        />

        <div className="space-y-2">
          {loading ? (
            <MobileLoading />
          ) : cards.length ? (
            cards.map((card) => (
              <article
                key={card.id}
                className="relative rounded-2xl border border-white/10 bg-white/[.045] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{card.front}</p>
                    <p className="mt-1 text-sm text-slate-400">{card.back}</p>
                    {card.sourceRef && (
                      <p className="mt-2 text-[11px] text-slate-500">From {card.sourceRef}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteCard(card.id)}
                    className="shrink-0 text-slate-500 active:text-rose-400"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <span
                  className={`absolute right-4 top-4 mt-8 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    new Date(card.dueDate) <= new Date()
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-white/[.06] text-slate-500"
                  }`}
                >
                  {new Date(card.dueDate) <= new Date() ? "Due" : `${card.interval}d`}
                </span>
              </article>
            ))
          ) : (
            <MobileEmpty text="No cards yet. Add some to start studying." />
          )}
        </div>

        {showCardForm && <CardForm />}
      </MobileContainer>
    );
  }

  return (
    <MobileContainer>
      <MobileHeader
        title="Flashcards"
        subtitle="Study what matters"
        onClose={onClose}
        right={<MobileFab onClick={() => setShowDeckForm(true)} icon={<Plus size={22} />} />}
      />

      <div className="space-y-3">
        {loading ? (
          <MobileLoading />
        ) : decks.length ? (
          decks.map((deck) => (
            <article
              key={deck.id}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.045] p-4"
            >
              <button
                type="button"
                onClick={() => void openDeck(deck)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: deck.color }} />
                  <span className="font-medium text-white">{deck.name}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{deck.description}</p>
                <p className="mt-2 text-[11px] text-slate-500">{deck._count.cards} cards</p>
              </button>
              <button
                type="button"
                onClick={() => void deleteDeck(deck)}
                className="shrink-0 text-slate-500 active:text-rose-400"
              >
                <Trash2 size={18} />
              </button>
            </article>
          ))
        ) : (
          <MobileEmpty text="No decks yet. Create a deck to start studying." />
        )}
      </div>

      {showDeckForm && <DeckForm />}
    </MobileContainer>
  );
}
