class LatestAlert extends React.Component {
  render() {
    const { alert } = this.props;

    if (!alert) {
      return null;
    }

    return (
      <div className="latest-alert">
        <h4>Latest Alert</h4>
        <p>
          <strong>{alert.order_action} {alert.ticker}</strong> at {alert.bar.close}
        </p>
        <p>{alert.strategy_name}</p>
        <p>{new Date(alert.time).toLocaleString()}</p>
      </div>
    );
  }
}
