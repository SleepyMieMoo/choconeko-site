/*
  ChocoNeko team list: the single place to add or edit members.

  To add a member:
    1. Add an object to MEMBERS below.
    2. (Optional) copy members/sleepymie.html to members/<id>.html,
       fill it in, and set `page` to "members/<id>.html".

  Fields:
    id          unique, used for the card anchor: index.html#member-<id>
    name        display / credit name (use exactly how the person wants to be credited)
    role        short role label
    blurb       one short line
    page        optional relative link to a member page
    website     optional external link
    lead        true for the lead card style
    placeholder true while the credit name is not confirmed yet
*/
window.CHOCONEKO_MEMBERS = [
  {
    id: "sleepymie",
    name: "SleepyMie",
    role: "Lead",
    blurb: "Leads the project, playtests builds and approves what goes in.",
    page: "members/sleepymie.html",
    website: "https://sleepymiemoo.github.io",
    lead: true
  }
];
