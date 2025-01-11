export function getSubject(pronouns: string): string {
  try {
    if (pronouns && pronouns !== "") {
      const pronounParts = pronouns.split("/");

      //if (pronounParts.length === 3) {
      return pronounParts[0]; // subject is the first part
      //}
    } else return "she";
  } catch {}
  return "she";
}

export function getObject(pronouns: string): string {
  try {
    if (pronouns && pronouns !== "") {
      const pronounParts = pronouns.split("/");
      return pronounParts[1]; // object is the second part
    } else {
      return "her";
    }
  } catch {}
  return "her";
}
