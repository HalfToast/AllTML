/**
 * Can pages load stuff from the web? 'follow' copies ST's isExternalMediaAllowed(), overrides included.
 * @param {object} ctx SillyTavern.getContext()
 * @param {'follow'|'allow'|'block'} mode AllTML's externalResources setting
 * @returns {boolean}
 */
export function isExternalAllowed(ctx, mode) {
    if (mode === 'allow') return true;
    if (mode === 'block') return false;

    const power = ctx.powerUserSettings ?? {};
    const entityId = ctx.groupId ? String(ctx.groupId) : (ctx.characters?.[ctx.characterId]?.avatar ?? null);
    if (entityId) {
        if ((power.external_media_allowed_overrides ?? []).includes(entityId)) return true;
        if ((power.external_media_forbidden_overrides ?? []).includes(entityId)) return false;
    }
    return !power.forbid_external_media;
}
