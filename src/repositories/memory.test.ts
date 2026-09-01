import { describe, expect, it } from "vitest";

import { MemoryProbeRepository } from "./memory";
import { AppError } from "./types";

describe("MemoryProbeRepository", () => {
  it("stores probe events and returns them newest first", async () => {
    const repository = new MemoryProbeRepository();

    await repository.insert({
      id: "a",
      message: "first",
      createdAt: "2026-09-02T04:00:00.000Z",
    });
    await repository.insert({
      id: "b",
      message: "second",
      createdAt: "2026-09-02T05:00:00.000Z",
    });

    const events = await repository.list();
    expect(events.map((event) => event.id)).toEqual(["b", "a"]);
    expect(await repository.getDatabaseInfo()).toMatchObject({
      path: ":memory:",
      schemaVersion: 1,
      integrityOk: true,
    });
  });

  it("rejects an empty message", async () => {
    const repository = new MemoryProbeRepository();

    await expect(
      repository.insert({
        id: "c",
        message: "   ",
        createdAt: "2026-09-02T04:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
