/* The sync layer between the host phone and the viewers. The host and the viewer code talk to this contract only,
   so the real Firebase driver and the test driver are interchangeable (the same idea as the Stack app's adapter).
   A room is one JSON tree at `rooms/<room>`; paths below are relative to the room. */

export interface LiveDriver {
  /** Signs in without an account and returns the user id. */
  signIn(): Promise<string>;
  /** Creates a room. Fails when the id is taken. */
  create(room: string, tree: Record<string, unknown>): Promise<void>;
  /** Writes (or, with null, deletes) the value at a path. */
  set(room: string, path: string, value: unknown): Promise<void>;
  /** Deletes a whole room. */
  remove(room: string): Promise<void>;
  /** Calls back with the current value at a path, then on every change. Returns a stop function. */
  watch(room: string, path: string, cb: (value: unknown) => void): () => void;
  /** Calls back with the connection state, then on every change. Returns a stop function. */
  connected(cb: (on: boolean) => void): () => void;
}

let current: LiveDriver | null = null;
export const setDriver = (d: LiveDriver | null) => { current = d; };
export const getDriver = (): LiveDriver | null => current;
