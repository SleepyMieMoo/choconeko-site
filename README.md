# ChocoNeko team website

The website for **ChocoNeko**, a chocolate-and-cat themed Roblox hub game that is currently in development. It introduces the game, explains how it is made and lists the team.

Live site: https://sleepymiemoo.github.io/choconeko-site/

## How it works

This is a plain static site: HTML, CSS and a little vanilla JavaScript. There is no build step and no dependencies. It is hosted with GitHub Pages straight from the `main` branch.

| Path | What it is |
| --- | --- |
| `index.html` | Home page: hero, about, team and links |
| `members/sleepymie.html` | SleepyMie's member page |
| `js/members.js` | The team list shown on the home page |
| `js/main.js` | Mobile menu, footer year and team cards |
| `css/style.css` | Theme and layout |
| `img/` | Logo and social preview image |
| `404.html` | Page shown for missing URLs |

To preview it, open `index.html` in a browser or serve the folder with any static file server.

## Adding a team member

1. Open `js/members.js` and add an object to the list, for example:

   ```js
   {
     id: "newmember",
     name: "NewMember",
     role: "Role",
     blurb: "One short line about what they do.",
     page: "members/newmember.html"
   }
   ```

   Use the name exactly as the person wants to be credited. `page` and `website` are optional.

2. (Optional) For a member page, copy `members/sleepymie.html` to `members/<id>.html` and update the name, role, avatar letter, title, description, social preview tags and links.

3. Commit and push to `main`. GitHub Pages updates the live site automatically.
