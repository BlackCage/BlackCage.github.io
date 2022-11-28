const categories = { HTB: [{ url: `/posts/fortune-htb/`, date: `27 Nov 2022`, title: `Fortune`},],HMV: [{ url: `/posts/movie-hmv/`, date: `28 Nov 2022`, title: `Movie`},{ url: `/posts/crazymed-hmv/`, date: `28 Nov 2022`, title: `CrazyMed`},{ url: `/posts/thewall-hmv/`, date: `27 Nov 2022`, title: `TheWall`},{ url: `/posts/jabita-hmv/`, date: `27 Nov 2022`, title: `Jabita`},], }

console.log(categories);

window.onload = function () {
  document.querySelectorAll(".article-category").forEach((category) => {
    category.addEventListener("click", function (e) {
      const posts = categories[e.target.innerText.replace(" ","_")];
      console.log(posts);
      let html = ``
      posts.forEach(post=>{
        html += `
        <a class="modal-article" href="${post.url}">
          <h4>${post.title}</h4>
          <small class="modal-article-date">${post.date}</small>
        </a>
        `
      })
      document.querySelector("#category-modal-title").innerText = e.target.innerText;
      document.querySelector("#category-modal-content").innerHTML = html;
      document.querySelector("#category-modal-bg").classList.toggle("open");
      document.querySelector("#category-modal").classList.toggle("open");
    });
  });

  document.querySelector("#category-modal-bg").addEventListener("click", function(){
    document.querySelector("#category-modal-title").innerText = "";
    document.querySelector("#category-modal-content").innerHTML = "";
    document.querySelector("#category-modal-bg").classList.toggle("open");
    document.querySelector("#category-modal").classList.toggle("open");
  })
};