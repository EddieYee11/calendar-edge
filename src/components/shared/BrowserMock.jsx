import React from 'react';

export function BrowserMock({ posts, actions, output }) {
  return (
    <div className="browser-mock">
      <header className="browser-mock__topbar">
        <div className="browser-mock__lights" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="browser-mock__url">agent://social-ops/session</div>
      </header>

      <div className="browser-mock__body">
        <div className="browser-mock__feed">
          <div className="browser-mock__feed-track">
            {posts.map((post) => (
              <article key={post.id} className="browser-mock__post">
                <div className="browser-mock__meta">
                  <strong>{post.author}</strong>
                  <span className={`browser-mock__tag browser-mock__tag--${post.tag}`}>{post.tag}</span>
                </div>
                <h4>{post.title}</h4>
                <p>{post.summary}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="browser-mock__panel">
          <div className="browser-mock__chips">
            {actions.map((action) => (
              <span key={action} className="browser-mock__chip">
                {action}
              </span>
            ))}
          </div>

          <article className="browser-mock__draft">
            <p className="browser-mock__draft-title">{output.title}</p>
            <p>{output.body}</p>
          </article>

          <div className="browser-mock__execute">EXECUTED</div>
        </aside>
      </div>
    </div>
  );
}
