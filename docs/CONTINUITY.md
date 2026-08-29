# Continuity and recovery

Lobby state is copied to the configured R2 bucket by the scheduled Worker. A restore drill reads the retained object back, reconstructs it into a scratch Durable Object, compares the state digest, records the result, and wipes scratch state. It does not overwrite production state.

Room simulation is deterministic from its seed, ordered actions, and RNG state. Runtime snapshots and the short capture window support investigation and replay, while the Lobby owns longer-lived profiles, receipts, and operational records.

A recovery decision must distinguish configuration loss, Worker-code regression, Lobby-state damage, room-state interruption, and supplier outage. Roll back code by redeploying a previously verified tag. Do not change Durable Object class names, migration tags, namespaces, or bucket bindings as a code rollback shortcut.

The public backup drill is evidence that the retained copy can be read and reconstructed into scratch state. It is not proof of regional disaster recovery, a guaranteed recovery time, or independent backup custody.
