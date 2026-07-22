/**
 * Seed script — creates a default admin user (from env) if none exist,
 * plus demo notes, tasks, and folders so the UI isn't empty on first run.
 */
import bcrypt from "bcryptjs";
import prisma from "./client";

async function main() {
  const username = process.env.SEED_USERNAME ?? "admin";
  const password = process.env.SEED_PASSWORD ?? "admin";

  let user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 10),
        displayName: "Student",
        avatarColor: "#6366f1",
      },
    });
    console.log(`Seeded user '${username}' (password: '${password}')`);
  } else {
    console.log(`User '${username}' already exists — skipping user seed.`);
  }

  // Demo note folder + notes
  const folder = await prisma.noteFolder.create({
    data: { name: "CS 101", userId: user.id },
  });
  await prisma.note.createMany({
    data: [
      {
        title: "Welcome to Athena",
        content:
          "# Welcome to Athena\n\nThis is your **Student OS**. Open apps from the **Start menu** or desktop icons.\n\n- Drag windows by their title bar\n- Resize from edges/corners\n- Press **Alt+Tab** to switch windows\n- Right-click the desktop for options\n\nTry the **Music Player** and link your Spotify!",
        tags: "welcome,guide",
        userId: user.id,
        pinned: true,
      },
      {
        title: "Lecture 3 — Data Structures",
        content:
          "# Lecture 3: Data Structures\n\n## Arrays\n- O(1) random access\n- O(n) insertion/deletion\n\n## Linked Lists\n- O(1) insert/delete at known node\n- O(n) search\n\n## Hash Maps\n- Average O(1) lookup/insert\n",
        tags: "cs101,lecture",
        userId: user.id,
        folderId: folder.id,
      },
      {
        title: "Lab Notes — Recursion",
        content:
          "# Recursion Lab\n\nBase case + recursive case.\n\n```python\ndef fact(n):\n    return 1 if n <= 1 else n * fact(n - 1)\n```\n",
        tags: "cs101,lab,recursion",
        userId: user.id,
        folderId: folder.id,
      },
    ],
  });

  // Demo tasks
  await prisma.task.createMany({
    data: [
      { title: "Read Chapter 5", description: "Algorithms textbook", status: "TODO", priority: "HIGH", userId: user.id, order: 0 },
      { title: "Problem Set 3", description: "Due Friday", status: "TODO", priority: "MEDIUM", userId: user.id, order: 1 },
      { title: "Group project meeting", description: "Zoom 4pm", status: "IN_PROGRESS", priority: "MEDIUM", userId: user.id, order: 0 },
      { title: "Submit Lab 2", status: "DONE", priority: "HIGH", userId: user.id, order: 0 },
      { title: "Review flashcards", status: "DONE", priority: "LOW", userId: user.id, order: 1 },
    ],
  });

  // Demo file folders
  const fileFolder = await prisma.vFolder.create({
    data: { name: "Lectures", userId: user.id },
  });
  await prisma.vFolder.create({
    data: { name: "Assignments", userId: user.id },
  });
  // (No actual files seeded — those require uploads.)

  // Demo flashcard deck
  const deck = await prisma.flashcardDeck.create({
    data: {
      name: "Data Structures",
      description: "Key concepts from CS 101",
      color: "#6366f1",
      userId: user.id,
    },
  });
  await prisma.flashcard.createMany({
    data: [
      { deckId: deck.id, front: "What is the time complexity of binary search?", back: "O(log n) — halves the search space each step." },
      { deckId: deck.id, front: "What is a hash collision?", back: "When two different keys map to the same bucket in a hash table." },
      { deckId: deck.id, front: "Difference between stack and queue?", back: "Stack is LIFO (last-in-first-out), queue is FIFO (first-in-first-out)." },
      { deckId: deck.id, front: "What is the height of a balanced BST with n nodes?", back: "O(log n)" },
      { deckId: deck.id, front: "What is dynamic programming?", back: "Breaking a problem into overlapping subproblems and caching results to avoid recomputation." },
    ],
  });

  const deck2 = await prisma.flashcardDeck.create({
    data: {
      name: "Spanish Vocabulary",
      description: "Common words and phrases",
      color: "#ec4899",
      userId: user.id,
    },
  });
  await prisma.flashcard.createMany({
    data: [
      { deckId: deck2.id, front: "Hello", back: "Hola" },
      { deckId: deck2.id, front: "Thank you", back: "Gracias" },
      { deckId: deck2.id, front: "Good morning", back: "Buenos días" },
      { deckId: deck2.id, front: "See you later", back: "Hasta luego" },
    ],
  });

  // Note: Grade Tracker starts empty. Use "Sync from VUT" in the Grades app
  // to import real grades from VUT Studis, or add courses manually.

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
